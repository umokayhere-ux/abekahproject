import { ok, withErrorHandling } from "@/lib/api";
import { platformCommissionPercent, registrationFeeGhs } from "@/lib/env";
import { isPaystackConfigured } from "@/lib/paystack";

/**
 * GET /api/config
 *
 * Public, non-secret settings the browser legitimately needs — chiefly the
 * landlord listing fee, so the sign-up form can state the amount without it
 * being hardcoded in two places and drifting.
 *
 * Only figures that are already visible to any user are exposed; no keys, no
 * connection details.
 */
export const revalidate = 300;

export const GET = withErrorHandling(async () => {
  return ok({
    landlordRegistrationFee: registrationFeeGhs(),
    platformCommissionPercent: platformCommissionPercent(),
    currency: "GHS",
    paymentsEnabled: isPaystackConfigured(),
  });
});
