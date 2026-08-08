import { connectDB } from "@/lib/db";
import { fail, notFound, ok, withErrorHandling } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { verifyTransaction } from "@/lib/paystack";
import { markPaymentFailed, settleSuccessfulPayment } from "@/lib/settle";
import { Payment } from "@/models/Payment";

/**
 * GET /api/payments/verify?reference=...
 *
 * Called when Paystack redirects the tenant back to the dashboard. This asks
 * Paystack directly rather than believing the redirect, and reuses the same
 * idempotent settlement path as the webhook — so whichever arrives first wins
 * and the second is a no-op.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  const reference = new URL(request.url).searchParams.get("reference")?.trim();

  if (!reference) {
    return fail("A payment reference is required", 400);
  }

  await connectDB();
  const payment = await Payment.findOne({ reference });
  if (!payment) return notFound("That payment could not be found");

  // Only the payer, the receiving landlord, or an admin may check a reference.
  const isParticipant =
    payment.tenant.toString() === auth.userId ||
    payment.landlord.toString() === auth.userId;
  if (auth.role !== "admin" && !isParticipant) {
    return fail("You do not have access to this payment", 403);
  }

  if (payment.status === "paid") {
    return ok({ status: "paid", reference, amount: payment.amount });
  }

  const transaction = await verifyTransaction(reference);

  if (transaction.status === "success") {
    await settleSuccessfulPayment(transaction);
    return ok({ status: "paid", reference, amount: payment.amount });
  }

  if (transaction.status === "failed") {
    await markPaymentFailed(
      reference,
      transaction.gateway_response ?? "Charge failed",
    );
    return ok({ status: "failed", reference, amount: payment.amount });
  }

  // Still in progress at Paystack (abandoned or ongoing).
  return ok({ status: "pending", reference, amount: payment.amount });
});
