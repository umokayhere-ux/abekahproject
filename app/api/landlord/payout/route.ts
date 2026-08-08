import { connectDB } from "@/lib/db";
import { HttpError, clientIp, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import { requireRole, toSafeUser } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { platformCommissionPercent } from "@/lib/env";
import {
  createSubaccount,
  isPaystackConfigured,
  resolveAccount,
  updateSubaccount,
} from "@/lib/paystack";
import { User } from "@/models/User";

/**
 * GET /api/landlord/payout — the caller's own payout configuration.
 *
 * The subaccount code and full account number are never returned; the client
 * only needs to know whether payouts are set up and which bank was used.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord");
  await connectDB();

  const landlord = await User.findById(auth.userId).select(
    "+paystackSubaccount +bankAccountNumber +bankAccountName bankName",
  );

  return ok({
    configured: Boolean(landlord?.paystackSubaccount),
    bankName: landlord?.bankName ?? "",
    accountName: landlord?.bankAccountName ?? "",
    // Masked: enough to recognise the account, not enough to reuse it.
    accountNumberMasked: landlord?.bankAccountNumber
      ? `••••${landlord.bankAccountNumber.slice(-4)}`
      : "",
    landlordSharePercent: 100 - platformCommissionPercent(),
    platformCommissionPercent: platformCommissionPercent(),
    paystackConfigured: isPaystackConfigured(),
  });
});

/**
 * POST /api/landlord/payout
 *
 * Creates or updates the landlord's Paystack subaccount so rent can be settled
 * to them. The account is resolved with Paystack first, which both validates
 * the number and gives us the registered account name.
 *
 * `percentage_charge` is the landlord's share (90%), leaving the platform's
 * 10% commission on the main account.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord");
  const body = await readJson(request);

  const v = new Validator(body);
  const bankCode = v.string("bankCode", { min: 1, max: 20, label: "Bank" });
  const bankName = v.string("bankName", { min: 2, max: 120, label: "Bank name" });
  const accountNumber = v.string("accountNumber", {
    min: 8,
    max: 20,
    label: "Account number",
  });
  v.assert();

  if (!/^\d+$/.test(accountNumber)) {
    throw new HttpError(422, "Please correct the highlighted fields", {
      accountNumber: "Account number must contain digits only",
    });
  }

  return handlePayoutSetup({
    request,
    auth,
    bankCode,
    bankName,
    accountNumber,
  });
});

async function handlePayoutSetup({
  request,
  auth,
  bankCode,
  bankName,
  accountNumber,
}: {
  request: Request;
  auth: Awaited<ReturnType<typeof requireRole>>;
  bankCode: string;
  bankName: string;
  accountNumber: string;
}) {
  await connectDB();

  // Confirms the account exists at that bank before we create anything.
  const resolved = await resolveAccount(accountNumber, bankCode);

  const landlord = await User.findById(auth.userId).select(
    "+paystackSubaccount name email phone",
  );
  const landlordSharePercent = 100 - platformCommissionPercent();

  const subaccount = landlord?.paystackSubaccount
    ? await updateSubaccount(landlord.paystackSubaccount, {
        businessName: auth.user.name,
        bankCode,
        accountNumber,
        landlordSharePercent,
      })
    : await createSubaccount({
        businessName: auth.user.name,
        bankCode,
        accountNumber,
        landlordSharePercent,
        email: auth.user.email,
        phone: auth.user.phone || undefined,
      });

  const updated = await User.findByIdAndUpdate(
    auth.userId,
    {
      $set: {
        paystackSubaccount: subaccount.subaccount_code,
        bankCode,
        bankName,
        bankAccountNumber: accountNumber,
        bankAccountName: resolved.account_name,
      },
    },
    { new: true },
  );

  await logActivity({
    action: ACTIONS.PAYOUT_CONFIGURED,
    actor: auth.user,
    targetType: "User",
    targetId: auth.userId,
    message: "Payout account configured",
    // Bank name only — the account number is deliberately not logged.
    metadata: { bankName, landlordSharePercent },
    ip: clientIp(request),
  });

  return ok({
    configured: true,
    accountName: resolved.account_name,
    bankName,
    accountNumberMasked: `••••${accountNumber.slice(-4)}`,
    landlordSharePercent,
    user: toSafeUser(updated ?? auth.user),
  });
}
