import { PAYMENT_CONFIG, platformCommissionPercent } from "./env";
import type { SplitBreakdown } from "@/types";

/**
 * Money helpers.
 *
 * All stored amounts are GHS in major units (cedis). Paystack transacts in
 * minor units (pesewas), so conversion happens only at the API boundary.
 */

export const CURRENCY = "GHS" as const;

/** Rounds to whole pesewas to avoid floating-point drift in stored totals. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toPesewas(cedis: number): number {
  return Math.round(cedis * 100);
}

export function fromPesewas(pesewas: number): number {
  return round2(pesewas / 100);
}

/**
 * Computes what the tenant pays and how it splits.
 *
 * The tenant pays the listed rent (plus any deposit); the landlord absorbs the
 * platform commission. So for GHS 1,000 rent with no deposit and a 10% rate:
 * tenant pays 1,000, platform keeps 100, landlord receives 900.
 *
 * `monthlyRent` must come from the Property document on the server — never from
 * a client-supplied amount.
 */
export function computeSplit(monthlyRent: number): SplitBreakdown {
  if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
    throw new Error("Monthly rent must be a positive number");
  }

  const rent = round2(monthlyRent);
  const deposit = PAYMENT_CONFIG.includeDeposit
    ? round2(rent * PAYMENT_CONFIG.depositMonths)
    : 0;

  const total = round2(rent + deposit);
  const commissionPercent = platformCommissionPercent();
  const platform = round2((total * commissionPercent) / 100);
  // Derive the landlord's share by subtraction so the parts always sum to the
  // total even when rounding moves a pesewa.
  const landlord = round2(total - platform);

  return {
    total,
    platform,
    landlord,
    commissionPercent,
    rent,
    deposit,
  };
}

/** Formats an amount as Ghana cedis for display. */
export function formatGHS(amount: number): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

/** Compact form used on listing cards, e.g. "GHS 1,200/mo". */
export function formatRent(amount: number): string {
  return `${formatGHS(amount)}/mo`;
}
