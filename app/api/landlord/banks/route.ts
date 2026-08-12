import { ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { listPayoutDestinations } from "@/lib/paystack";

/**
 * GET /api/landlord/banks
 *
 * Proxies Paystack's Ghana destination list so the payout form can offer a
 * picker without the browser ever seeing the secret key. Banks and mobile
 * money wallets are returned separately, since the form treats them
 * differently — a wallet is identified by a phone number, not an account
 * number.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireRole(request, "landlord");
  const { banks, mobileMoney } = await listPayoutDestinations();
  return ok({ banks, mobileMoney });
});
