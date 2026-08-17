import { connectDB } from "./db";
import { ACTIONS, logActivity } from "./activity";
import { fromPesewas } from "./money";
import type { VerifiedTransaction } from "./paystack";
import { Payment } from "@/models/Payment";
import { Booking } from "@/models/Booking";
import { Property } from "@/models/Property";
import { User } from "@/models/User";
import { PendingRegistration } from "@/models/PendingRegistration";


/**
 * Creates the landlord account a sign-up payment was for.
 *
 * Returns `null` when the reference is not a sign-up, so the caller falls
 * through to the ordinary payment path.
 *
 * Idempotent in both directions: the pending record is deleted as part of
 * claiming it, so a duplicate delivery finds nothing; and if the account
 * already exists (a retry that raced), that is reported as settled rather than
 * failing.
 */
async function completeLandlordSignup(
  transaction: VerifiedTransaction,
): Promise<{ applied: boolean; reason?: string } | null> {
  const pending = await PendingRegistration.findOne({
    reference: transaction.reference,
  }).select("+password");

  if (!pending) return null;

  const paidAmount = fromPesewas(transaction.amount);
  if (paidAmount + 0.01 < pending.amount) {
    // Underpaid: leave the pending record to expire rather than granting an
    // account. Nothing is created.
    console.error(
      `[settle] sign-up underpaid: expected ${pending.amount}, received ${paidAmount}`,
    );
    return { applied: false, reason: "amount-mismatch" };
  }

  // Claim the pending record. Deleting it *before* creating the user is what
  // makes concurrent deliveries safe: only one caller gets a document back.
  const claimed = await PendingRegistration.findOneAndDelete({
    _id: pending._id,
  }).select("+password");

  if (!claimed) {
    // Another delivery got there first.
    return { applied: false, reason: "already-settled" };
  }

  const existing = await User.findOne({ email: claimed.email }).select("_id");
  if (existing) {
    // The account was already created by an earlier delivery.
    return { applied: false, reason: "already-settled" };
  }

  const user = await User.create({
    name: claimed.name,
    email: claimed.email,
    // Already hashed when the pending record was written.
    password: claimed.password,
    role: "landlord",
    phone: claimed.phone,
    verified: false,
    suspended: false,
    // Paid for at sign-up, which is the whole point of this path.
    registrationFeePaid: true,
    registrationFeePaidAt: new Date(),
    // Paying is not the last gate: an administrator still has to approve the
    // account before it can sign in.
    approvalStatus: "pending",
  });

  // Now that a user exists, record the payment against it.
  await Payment.create({
    tenant: user._id,
    landlord: user._id,
    purpose: "registration_fee",
    amount: claimed.amount,
    currency: "GHS",
    status: "paid",
    reference: claimed.reference,
    paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
    splitBreakdown: {
      total: claimed.amount,
      platform: claimed.amount,
      landlord: 0,
      commissionPercent: 100,
      rent: 0,
      deposit: 0,
    },
    paystack: {
      transactionId: transaction.id,
      channel: transaction.channel,
      paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
      fees: transaction.fees ? fromPesewas(transaction.fees) : undefined,
    },
  });

  await logActivity({
    action: ACTIONS.REGISTER,
    actor: user,
    targetType: "User",
    targetId: user._id.toString(),
    message:
      "landlord account created after paying the registration fee, awaiting admin approval",
    metadata: { reference: claimed.reference, amount: claimed.amount },
  });

  return { applied: true };
}

/**
 * Applies a successful transaction to our records.
 *
 * Shared by the webhook and the callback verification endpoint, and safe to
 * call repeatedly: the status transition is a conditional update, so only the
 * first caller does the work and any later duplicate is a no-op. This is what
 * makes webhook delivery idempotent.
 */
export async function settleSuccessfulPayment(
  transaction: VerifiedTransaction,
): Promise<{ applied: boolean; reason?: string }> {
  await connectDB();

  // A landlord sign-up is paid for before any account exists, so its reference
  // belongs to a pending registration rather than a payment row.
  const completed = await completeLandlordSignup(transaction);
  if (completed) return completed;

  const payment = await Payment.findOne({ reference: transaction.reference });
  if (!payment) {
    return { applied: false, reason: "unknown-reference" };
  }

  if (payment.status === "paid") {
    // Already settled by an earlier delivery of the same event.
    return { applied: false, reason: "already-settled" };
  }

  const paidAmount = fromPesewas(transaction.amount);
  // Guard against a tampered or mismatched amount before crediting anything.
  if (paidAmount + 0.01 < payment.amount) {
    payment.status = "failed";
    payment.failureReason = `Amount mismatch: expected ${payment.amount}, received ${paidAmount}`;
    await payment.save();
    return { applied: false, reason: "amount-mismatch" };
  }

  // Conditional update: only the transition out of a non-paid state succeeds,
  // so concurrent deliveries cannot both apply the settlement.
  const result = await Payment.updateOne(
    { _id: payment._id, status: { $ne: "paid" } },
    {
      $set: {
        status: "paid",
        paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
        paystack: {
          transactionId: transaction.id,
          channel: transaction.channel,
          cardType: transaction.authorization?.card_type,
          last4: transaction.authorization?.last4,
          paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
          subaccount: transaction.subaccount?.subaccount_code,
          fees: transaction.fees ? fromPesewas(transaction.fees) : undefined,
        },
      },
    },
  );

  if (result.modifiedCount === 0) {
    return { applied: false, reason: "already-settled" };
  }

  // A registration fee unlocks listing for the landlord; it has no booking.
  // This is the only place the flag is set — never from a client request — so
  // the gate cannot be lifted without money actually arriving.
  if (payment.purpose === "registration_fee") {
    await User.updateOne(
      { _id: payment.landlord },
      { $set: { registrationFeePaid: true, registrationFeePaidAt: new Date() } },
    );

    await logActivity({
      action: ACTIONS.PAYMENT_COMPLETED,
      actor: { _id: payment.landlord },
      targetType: "Payment",
      targetId: payment._id.toString(),
      message: "Landlord registration fee paid",
      metadata: {
        reference: payment.reference,
        amount: payment.amount,
        currency: payment.currency,
        purpose: "registration_fee",
      },
    });

    return { applied: true };
  }

  // Payment is authoritative: confirm the booking and take the listing off the
  // market. The frontend never gets to make this call.
  if (payment.booking) {
    await Booking.updateOne(
      { _id: payment.booking, status: { $ne: "cancelled" } },
      { $set: { status: "confirmed" } },
    );
    await Property.updateOne(
      { _id: payment.property },
      { $set: { status: "rented" } },
    );
    // Release other tenants queued on the same listing.
    await Booking.updateMany(
      {
        property: payment.property,
        _id: { $ne: payment.booking },
        status: "pending",
      },
      { $set: { status: "cancelled" } },
    );
  }

  await logActivity({
    action: ACTIONS.PAYMENT_COMPLETED,
    actor: { _id: payment.tenant },
    targetType: "Payment",
    targetId: payment._id.toString(),
    message: "Payment completed and booking confirmed",
    metadata: {
      reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
      platformCommission: payment.splitBreakdown?.platform,
      landlordAmount: payment.splitBreakdown?.landlord,
    },
  });

  return { applied: true };
}

/** Marks a payment failed. Also idempotent — a settled payment is left alone. */
export async function markPaymentFailed(
  reference: string,
  reason: string,
): Promise<void> {
  await connectDB();

  // A failed sign-up payment leaves no account. Dropping the pending record
  // now releases the email immediately instead of waiting for it to expire.
  const pending = await PendingRegistration.findOneAndDelete({ reference });
  if (pending) {
    await logActivity({
      action: ACTIONS.PAYMENT_FAILED,
      targetType: "PendingRegistration",
      targetId: pending._id.toString(),
      message: `Landlord sign-up payment failed for ${pending.email}`,
      metadata: { reference, reason },
    });
    return;
  }

  const result = await Payment.findOneAndUpdate(
    { reference, status: "pending" },
    { $set: { status: "failed", failureReason: reason } },
    { new: true },
  );

  if (result) {
    await logActivity({
      action: ACTIONS.PAYMENT_FAILED,
      actor: { _id: result.tenant },
      targetType: "Payment",
      targetId: result._id.toString(),
      message: "Payment failed",
      metadata: { reference, reason },
    });
  }
}
