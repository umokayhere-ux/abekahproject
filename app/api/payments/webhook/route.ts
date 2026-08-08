import { NextResponse } from "next/server";
import { verifyWebhookSignature, type VerifiedTransaction } from "@/lib/paystack";
import { markPaymentFailed, settleSuccessfulPayment } from "@/lib/settle";

/**
 * POST /api/payments/webhook
 *
 * Paystack's server-to-server notification, and the authoritative source of
 * truth for whether a payment succeeded — a booking is never confirmed because
 * the browser said so.
 *
 * The raw body is read as text and HMAC-verified before it is parsed, because
 * the signature covers the exact bytes Paystack sent.
 */
export async function POST(request: Request) {
  // Read the body exactly once, as text, for signature verification.
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  let signatureValid: boolean;
  try {
    signatureValid = verifyWebhookSignature(rawBody, signature);
  } catch (error) {
    // Thrown when the secret key is not configured at all.
    console.error("[webhook] cannot verify signature:", error);
    return NextResponse.json(
      { success: false, message: "Webhook is not configured" },
      { status: 503 },
    );
  }

  if (!signatureValid) {
    console.warn("[webhook] rejected a request with an invalid signature");
    return NextResponse.json(
      { success: false, message: "Invalid signature" },
      { status: 401 },
    );
  }

  let event: { event?: string; data?: VerifiedTransaction };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { success: false, message: "Malformed payload" },
      { status: 400 },
    );
  }

  const transaction = event.data;
  if (!transaction?.reference) {
    // Nothing actionable, but acknowledge so Paystack stops retrying.
    return NextResponse.json({ success: true, data: { ignored: true } });
  }

  try {
    switch (event.event) {
      case "charge.success": {
        const result = await settleSuccessfulPayment(transaction);
        return NextResponse.json({
          success: true,
          data: { applied: result.applied, reason: result.reason },
        });
      }

      case "charge.failed": {
        await markPaymentFailed(
          transaction.reference,
          transaction.gateway_response ?? "Charge failed at Paystack",
        );
        return NextResponse.json({ success: true, data: { applied: true } });
      }

      default:
        // Every other event type is acknowledged and ignored.
        return NextResponse.json({ success: true, data: { ignored: true } });
    }
  } catch (error) {
    console.error("[webhook] failed to process event:", error);
    // A 500 tells Paystack to retry, which is the correct behaviour for a
    // transient failure on our side.
    return NextResponse.json(
      { success: false, message: "Processing failed" },
      { status: 500 },
    );
  }
}
