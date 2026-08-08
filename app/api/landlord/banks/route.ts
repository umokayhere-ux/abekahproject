import { ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { listBanks } from "@/lib/paystack";

/**
 * GET /api/landlord/banks
 *
 * Proxies Paystack's Ghana bank list so the payout form can offer a picker
 * without the browser ever seeing the secret key.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireRole(request, "landlord");
  const banks = await listBanks();
  return ok({ banks });
});
