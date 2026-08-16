import { connectDB } from "@/lib/db";
import { clientIp, fail, ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { env, registrationFeeGhs } from "@/lib/env";
import { generateReference, initializeTransaction } from "@/lib/paystack";
import { Payment } from "@/models/Payment";

/**
 * GET /api/payments/registration-fee
 *
 * What the landlord owes, and whether they have paid. Lets the dashboard show
 * the amount without hardcoding it in the client.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord");
  await connectDB();

  const pending = await Payment.findOne({
    landlord: auth.userId,
    purpose: "registration_fee",
    status: "pending",
  }).sort({ createdAt: -1 });

  return ok({
    amount: registrationFeeGhs(),
    currency: "GHS",
    paid: Boolean(auth.user.registrationFeePaid),
    paidAt: auth.user.registrationFeePaidAt?.toISOString(),
    pendingReference: pending?.reference,
  });
});

/**
 * POST /api/payments/registration-fee
 *
 * Starts checkout for the one-off listing fee.
 *
 * Unlike rent, this is *not* split: the whole amount goes to the platform
 * account, so no subaccount is involved and a landlord can pay before they
 * have set up payouts. The amount comes from server configuration, never from
 * the request.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord");
  await connectDB();

  if (auth.user.registrationFeePaid) {
    return fail("You have already paid your registration fee", 409);
  }

  const amount = registrationFeeGhs();
  const reference = generateReference();

  // Recorded as pending before Paystack is called, so a webhook arriving
  // before this request finishes still finds a row to reconcile against.
  const payment = await Payment.create({
    // The landlord is both payer and beneficiary-of-record here; the money
    // itself goes to the platform, which is why there is no subaccount.
    tenant: auth.userId,
    landlord: auth.userId,
    purpose: "registration_fee",
    amount,
    currency: "GHS",
    status: "pending",
    reference,
    splitBreakdown: {
      total: amount,
      // The platform keeps all of it.
      platform: amount,
      landlord: 0,
      commissionPercent: 100,
      rent: 0,
      deposit: 0,
    },
  });

  try {
    const transaction = await initializeTransaction({
      email: auth.user.email,
      amountCedis: amount,
      reference,
      // No subaccount: settles wholly to the platform account.
      subaccountCode: undefined,
      callbackUrl: `${env.appUrl}/dashboard/landlord?tab=overview&reference=${reference}`,
      metadata: {
        purpose: "registration_fee",
        landlordId: auth.userId,
        landlordName: auth.user.name,
      },
    });

    await logActivity({
      action: ACTIONS.PAYMENT_INITIALIZED,
      actor: auth.user,
      targetType: "Payment",
      targetId: payment._id.toString(),
      message: "Registration fee initialised",
      metadata: { reference, amount, currency: "GHS", purpose: "registration_fee" },
      ip: clientIp(request),
    });

    return ok({
      authorizationUrl: transaction.authorization_url,
      accessCode: transaction.access_code,
      reference,
      amount,
      currency: "GHS",
    });
  } catch (error) {
    // Paystack refused; do not leave a dangling pending row.
    payment.status = "failed";
    payment.failureReason = "Initialisation with Paystack failed";
    await payment.save();
    throw error;
  }
});
