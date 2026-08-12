import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { HttpError } from "./api";
import { toPesewas } from "./money";

/**
 * Paystack client. Server-only: PAYSTACK_SECRET_KEY must never be bundled into
 * client code, so nothing in this module may be imported by a Client Component.
 */

const BASE_URL = "https://api.paystack.co";

function secret(): string {
  const key = env.paystackSecretKey;
  if (!key) {
    throw new HttpError(
      503,
      "Payments are not configured on this deployment. Set PAYSTACK_SECRET_KEY.",
    );
  }
  return key;
}

export function isPaystackConfigured(): boolean {
  return Boolean(env.paystackSecretKey);
}

interface PaystackEnvelope<T> {
  status: boolean;
  message: string;
  data: T;
}

async function paystackFetch<T>(
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown } = { method: "GET" },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/json",
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      // Payment calls must never be served from a cache.
      cache: "no-store",
    });
  } catch (error) {
    console.error("[paystack] network failure:", error);
    throw new HttpError(502, "Could not reach Paystack. Please try again.");
  }

  let payload: PaystackEnvelope<T> | undefined;
  try {
    payload = (await response.json()) as PaystackEnvelope<T>;
  } catch {
    payload = undefined;
  }

  if (!response.ok || !payload?.status) {
    // Log the provider's message server-side, return something safe.
    console.error("[paystack] request failed", {
      path,
      status: response.status,
      message: payload?.message,
    });
    throw new HttpError(
      502,
      payload?.message
        ? `Paystack: ${payload.message}`
        : "Paystack rejected the request",
    );
  }

  return payload.data;
}

export interface PaystackBank {
  name: string;
  code: string;
  currency: string;
  /** Paystack's own classification, e.g. "mobile_money" or "ghipss". */
  type: string;
}

/**
 * True when an entry is a mobile money wallet rather than a bank.
 *
 * Matched loosely against both the type and the name, because the exact label
 * is Paystack's to choose and has changed before. A provider that slips
 * through is still selectable — it just appears under Bank — so a bad guess
 * degrades the grouping rather than hiding the option.
 */
export function isMobileMoney(entry: PaystackBank): boolean {
  const haystack = `${entry.type} ${entry.name}`.toLowerCase();
  return (
    /mobile[\s_-]?money|momo/.test(haystack) ||
    // The three Ghanaian wallet brands, in case the type is unhelpful.
    /\b(mtn|vodafone|telecel|airteltigo|airtel|tigo)\b/.test(haystack)
  );
}

export interface GhanaPayoutDestinations {
  banks: PaystackBank[];
  mobileMoney: PaystackBank[];
}

/**
 * Ghanaian banks and mobile money providers supported by Paystack, split into
 * the two groups the payout form offers.
 *
 * The grouping is derived from the live response rather than a hardcoded list,
 * so new providers appear without a code change.
 */
export async function listPayoutDestinations(): Promise<GhanaPayoutDestinations> {
  const data = await paystackFetch<PaystackBank[]>(
    "/bank?country=ghana&currency=GHS",
  );

  const entries = data.map((bank) => ({
    name: bank.name,
    code: bank.code,
    currency: bank.currency,
    type: bank.type,
  }));

  const byName = (a: PaystackBank, b: PaystackBank) =>
    a.name.localeCompare(b.name);

  return {
    banks: entries.filter((entry) => !isMobileMoney(entry)).sort(byName),
    mobileMoney: entries.filter(isMobileMoney).sort(byName),
  };
}

export interface ResolvedAccount {
  account_number: string;
  account_name: string;
}

/** Confirms the account exists and returns the registered account name. */
export async function resolveAccount(
  accountNumber: string,
  bankCode: string,
): Promise<ResolvedAccount> {
  return paystackFetch<ResolvedAccount>(
    `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
  );
}

export interface Subaccount {
  subaccount_code: string;
  business_name: string;
  account_number: string;
  settlement_bank: string;
  percentage_charge: number;
}

/**
 * Creates (or updates) the landlord's subaccount.
 *
 * `percentage_charge` is the share the *subaccount* receives, so the landlord's
 * 90% is expressed directly here and Paystack retains the remainder for the
 * platform account.
 */
export async function createSubaccount(input: {
  businessName: string;
  bankCode: string;
  accountNumber: string;
  landlordSharePercent: number;
  email?: string;
  phone?: string;
}): Promise<Subaccount> {
  return paystackFetch<Subaccount>("/subaccount", {
    method: "POST",
    body: {
      business_name: input.businessName,
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: input.landlordSharePercent,
      primary_contact_email: input.email,
      primary_contact_phone: input.phone,
    },
  });
}

export async function updateSubaccount(
  code: string,
  input: {
    businessName?: string;
    bankCode?: string;
    accountNumber?: string;
    landlordSharePercent?: number;
  },
): Promise<Subaccount> {
  return paystackFetch<Subaccount>(`/subaccount/${encodeURIComponent(code)}`, {
    method: "PUT",
    body: {
      business_name: input.businessName,
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
      percentage_charge: input.landlordSharePercent,
    },
  });
}

export interface InitializedTransaction {
  authorization_url: string;
  access_code: string;
  reference: string;
}

/**
 * Initialises a checkout.
 *
 * `amountCedis` is always computed server-side from the property record.
 * `bearer: "subaccount"` makes the landlord absorb Paystack's own transaction
 * fee alongside the platform commission, so the tenant is charged exactly the
 * listed amount.
 */
export async function initializeTransaction(input: {
  email: string;
  amountCedis: number;
  reference: string;
  subaccountCode: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<InitializedTransaction> {
  return paystackFetch<InitializedTransaction>("/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: toPesewas(input.amountCedis),
      currency: "GHS",
      reference: input.reference,
      subaccount: input.subaccountCode,
      bearer: "subaccount",
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });
}

export interface VerifiedTransaction {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  channel?: string;
  paid_at?: string;
  fees?: number;
  gateway_response?: string;
  authorization?: { card_type?: string; last4?: string };
  subaccount?: { subaccount_code?: string };
}

/** Server-side source of truth for a transaction's outcome. */
export async function verifyTransaction(
  reference: string,
): Promise<VerifiedTransaction> {
  return paystackFetch<VerifiedTransaction>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

/**
 * Verifies the `x-paystack-signature` header, which is an HMAC-SHA512 of the
 * raw request body keyed with the secret key. Compared in constant time.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  if (!signature) return false;

  const expected = createHmac("sha512", secret()).update(rawBody).digest("hex");
  const provided = signature.trim().toLowerCase();

  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

/** Collision-resistant, human-greppable payment reference. */
export function generateReference(): string {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `RF-${Date.now().toString(36).toUpperCase()}-${random.toUpperCase()}`;
}
