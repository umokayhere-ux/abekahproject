import { connectDB } from "./db";
import { ACTIONS, logActivity } from "./activity";
import { fromPesewas } from "./money";
import type { VerifiedTransaction } from "./paystack";
import { Payment } from "@/models/Payment";
import { Booking } from "@/models/Booking";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

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
