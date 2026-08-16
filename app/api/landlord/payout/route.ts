import { connectDB } from "@/lib/db";
import { HttpError, clientIp, ok, withErrorHandling } from "@/lib/api";
import { Validator, normalizeMomoNumber, readJson } from "@/lib/validate";
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
import { PAYOUT_CHANNELS, type PayoutChannel } from "@/types";

/**
 * GET /api/landlord/payout — the caller's own payout configuration.
 *
 * The subaccount code and full account number are never returned; the client
 * only needs to know whether payouts are set up and where they settle.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord");
  await connectDB();

  const landlord = await User.findById(auth.userId).select(
    "+paystackSubaccount +bankAccountNumber +bankAccountName bankName payoutChannel",
  );

  return ok({
    configured: Boolean(landlord?.paystackSubaccount),
    channel: landlord?.payoutChannel ?? null,
    bankName: landlord?.bankName ?? "",
    accountName: landlord?.bankAccountName ?? "",
    // Masked: enough to recognise the destination, not enough to reuse it.
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
 * Creates or updates the landlord's Paystack subaccount so rent can settle to
 * them, either to a bank account or a mobile money wallet.
 *
 * Both channels use the same Paystack shape — `settlement_bank` is the
 * provider code and `account_number` identifies the destination — but the
 * account number means different things: a bank account number, or a
 * Ghanaian phone number for a wallet. They are validated accordingly and the
 * destination is resolved with Paystack before anything is created.
 *
 * `percentage_charge` is the landlord's share (95%), leaving the platform's
 * 5% commission on the main account.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord");
  const body = await readJson(request);

  const v = new Validator(body);
  const bankCode = v.string("bankCode", { min: 1, max: 20, label: "Provider" });
  const bankName = v.string("bankName", {
    min: 2,
    max: 120,
    label: "Provider name",
  });
  const rawAccountNumber = v.string("accountNumber", {
    min: 8,
    max: 20,
    label: "Account number",
  });
  // Defaults to bank so a client written before mobile money existed still works.
  const channel =
    v.enum("channel", PAYOUT_CHANNELS, { required: false, label: "Channel" }) ??
    "bank";
  v.assert();

  const accountNumber = normalizeAccountNumber(channel, rawAccountNumber);

  return handlePayoutSetup({
    request,
    auth,
    channel,
    bankCode,
    bankName,
    accountNumber,
  });
});

/**
 * Validates and canonicalises the destination identifier for its channel.
 * Mobile money numbers are normalised to the local ten-digit form.
 */
function normalizeAccountNumber(
  channel: PayoutChannel,
  input: string,
): string {
  if (channel === "mobile_money") {
    const normalized = normalizeMomoNumber(input);
    if (!normalized) {
      throw new HttpError(422, "Please correct the highlighted fields", {
        accountNumber:
          "Enter a valid Ghanaian mobile money number, e.g. 0244123456",
      });
    }
    return normalized;
  }

  if (!/^\d+$/.test(input)) {
    throw new HttpError(422, "Please correct the highlighted fields", {
      accountNumber: "Account number must contain digits only",
    });
  }
  return input;
}

async function handlePayoutSetup({
  request,
  auth,
  channel,
  bankCode,
  bankName,
  accountNumber,
}: {
  request: Request;
  auth: Awaited<ReturnType<typeof requireRole>>;
  channel: PayoutChannel;
  bankCode: string;
  bankName: string;
  accountNumber: string;
}) {
  await connectDB();

  // Confirms the destination exists before we create anything, and gives us
  // the registered name to show back to the landlord.
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
        payoutChannel: channel,
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
    message: `Payout account configured (${channel === "mobile_money" ? "mobile money" : "bank"})`,
    // Provider and channel only — the account number is deliberately not logged.
    metadata: { channel, bankName, landlordSharePercent },
    ip: clientIp(request),
  });

  return ok({
    configured: true,
    channel,
    accountName: resolved.account_name,
    bankName,
    accountNumberMasked: `••••${accountNumber.slice(-4)}`,
    landlordSharePercent,
    user: toSafeUser(updated ?? auth.user),
  });
}
