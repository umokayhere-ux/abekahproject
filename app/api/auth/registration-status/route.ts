import { connectDB } from "@/lib/db";
import { fail, ok, withErrorHandling } from "@/lib/api";
import { verifyTransaction } from "@/lib/paystack";
import { markPaymentFailed, settleSuccessfulPayment } from "@/lib/settle";
import { User } from "@/models/User";
import { Payment } from "@/models/Payment";
import { PendingRegistration } from "@/models/PendingRegistration";

/**
 * GET /api/auth/registration-status?reference=...
 *
 * Tells the sign-up completion page whether the landlord's account now exists.
 *
 * Deliberately unauthenticated: the account is created *by* this payment, so
 * there is no session to authenticate with yet. The reference is a long random
 * string known only to whoever started the sign-up, and the response says
 * nothing beyond the state of that one transaction.
 *
 * It also verifies with Paystack and settles if needed, so a landlord is not
 * stranded when the webhook is slow, misconfigured, or unreachable in local
 * development.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const reference = new URL(request.url).searchParams.get("reference")?.trim();
  if (!reference) {
    return fail("A payment reference is required", 400);
  }

  await connectDB();

  // Fast path: the webhook already completed this sign-up.
  const settled = await Payment.findOne({
    reference,
    purpose: "registration_fee",
    status: "paid",
  }).select("landlord");

  if (settled) {
    const user = await User.findById(settled.landlord).select(
      "email approvalStatus",
    );
    return ok({
      status: "complete",
      email: user?.email,
      approvalStatus: user?.approvalStatus,
    });
  }

  const pending = await PendingRegistration.findOne({ reference }).select(
    "email",
  );
  if (!pending) {
    // Neither settled nor pending: expired, failed, or never existed.
    return ok({ status: "unknown" });
  }

  // Still pending. Ask Paystack directly rather than waiting on the webhook.
  const transaction = await verifyTransaction(reference);

  if (transaction.status === "success") {
    const result = await settleSuccessfulPayment(transaction);
    if (result.applied || result.reason === "already-settled") {
      // A freshly created landlord always starts out awaiting approval.
      return ok({
        status: "complete",
        email: pending.email,
        approvalStatus: "pending",
      });
    }
    return ok({ status: "failed", email: pending.email });
  }

  if (transaction.status === "failed") {
    await markPaymentFailed(
      reference,
      transaction.gateway_response ?? "Charge failed",
    );
    return ok({ status: "failed", email: pending.email });
  }

  return ok({ status: "pending", email: pending.email });
});
