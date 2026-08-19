import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registrationFeeGhs, platformCommissionPercent } from "@/lib/env";
import { computeSplit } from "@/lib/money";

/**
 * The commercial terms: a one-off GHS 50 landlord fee, and a 5% platform
 * commission on rent with the remaining 95% going to the landlord.
 */
describe("landlord registration fee", () => {
  const original = process.env.LANDLORD_REGISTRATION_FEE_GHS;

  afterEach(() => {
    if (original === undefined) delete process.env.LANDLORD_REGISTRATION_FEE_GHS;
    else process.env.LANDLORD_REGISTRATION_FEE_GHS = original;
  });

  it("defaults to GHS 50", () => {
    delete process.env.LANDLORD_REGISTRATION_FEE_GHS;
    expect(registrationFeeGhs()).toBe(50);
  });

  it("honours a configured amount", () => {
    process.env.LANDLORD_REGISTRATION_FEE_GHS = "75";
    expect(registrationFeeGhs()).toBe(75);
  });

  it("falls back when the configured amount is unusable", () => {
    // A zero or negative fee would create an uncollectable charge.
    for (const bad of ["0", "-10", "abc", ""]) {
      process.env.LANDLORD_REGISTRATION_FEE_GHS = bad;
      expect(registrationFeeGhs(), bad).toBe(50);
    }
  });
});

describe("rent commission", () => {
  const original = process.env.PLATFORM_COMMISSION_PERCENT;

  beforeEach(() => {
    delete process.env.PLATFORM_COMMISSION_PERCENT;
    process.env.PAYMENT_INCLUDE_DEPOSIT = "false";
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PLATFORM_COMMISSION_PERCENT;
    else process.env.PLATFORM_COMMISSION_PERCENT = original;
  });

  it("defaults to 5%", () => {
    expect(platformCommissionPercent()).toBe(5);
  });

  it("splits GHS 1,000 rent into 950 landlord / 50 platform", () => {
    const split = computeSplit(1000);

    expect(split.total).toBe(1000);
    expect(split.platform).toBe(50);
    expect(split.landlord).toBe(950);
    expect(split.commissionPercent).toBe(5);
  });

  it("still charges the tenant exactly the listed rent", () => {
    // The landlord absorbs the commission; the tenant is never marked up.
    for (const rent of [500, 1000, 3500, 12_000]) {
      expect(computeSplit(rent).total).toBe(rent);
    }
  });

  it("gives the landlord 95% across a range of rents", () => {
    for (const rent of [550, 700, 1200, 2200, 4500, 18_000]) {
      const split = computeSplit(rent);
      expect(split.landlord, `rent ${rent}`).toBeCloseTo(rent * 0.95, 2);
      expect(split.platform, `rent ${rent}`).toBeCloseTo(rent * 0.05, 2);
    }
  });

  it("keeps the parts summing to the total despite rounding", () => {
    for (const rent of [333.33, 99.99, 1234.56, 7777.77]) {
      const split = computeSplit(rent);
      expect(split.platform + split.landlord).toBeCloseTo(split.total, 10);
    }
  });

  it("applies the commission to rent plus deposit when a deposit is charged", () => {
    process.env.PAYMENT_INCLUDE_DEPOSIT = "true";
    process.env.PAYMENT_DEPOSIT_MONTHS = "1";

    const split = computeSplit(1000);

    expect(split.total).toBe(2000);
    expect(split.platform).toBe(100);
    expect(split.landlord).toBe(1900);
  });
});
