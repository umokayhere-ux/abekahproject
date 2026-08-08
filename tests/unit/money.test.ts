import { beforeEach, describe, expect, it } from "vitest";
import { computeSplit, formatGHS, fromPesewas, toPesewas } from "@/lib/money";

/**
 * The commission split is the money-critical calculation in the platform, so
 * the worked example from the specification is asserted directly.
 */
describe("computeSplit", () => {
  beforeEach(() => {
    // Deposit off by default so the base case is exactly the rent.
    process.env.PAYMENT_INCLUDE_DEPOSIT = "false";
    process.env.PLATFORM_COMMISSION_PERCENT = "10";
  });

  it("splits GHS 1,000 rent into 900 landlord / 100 platform", () => {
    const split = computeSplit(1000);

    expect(split.total).toBe(1000);
    expect(split.platform).toBe(100);
    expect(split.landlord).toBe(900);
    expect(split.commissionPercent).toBe(10);
  });

  it("charges the tenant exactly the listed rent", () => {
    // The landlord absorbs the commission; the tenant is never marked up.
    for (const rent of [500, 1000, 1234.56, 18_000]) {
      expect(computeSplit(rent).total).toBe(Math.round(rent * 100) / 100);
    }
  });

  it("always has the parts sum to the total, despite rounding", () => {
    // 333.33 * 10% = 33.333, which cannot be represented in whole pesewas.
    for (const rent of [333.33, 0.03, 99.99, 1234.56, 7777.77]) {
      const split = computeSplit(rent);
      expect(split.platform + split.landlord).toBeCloseTo(split.total, 10);
    }
  });

  it("includes a deposit when configured", () => {
    process.env.PAYMENT_INCLUDE_DEPOSIT = "true";
    process.env.PAYMENT_DEPOSIT_MONTHS = "1";

    const split = computeSplit(1000);

    expect(split.rent).toBe(1000);
    expect(split.deposit).toBe(1000);
    // First month plus a one-month deposit.
    expect(split.total).toBe(2000);
    expect(split.platform).toBe(200);
    expect(split.landlord).toBe(1800);
  });

  it("honours a configured deposit of more than one month", () => {
    process.env.PAYMENT_INCLUDE_DEPOSIT = "true";
    process.env.PAYMENT_DEPOSIT_MONTHS = "2";

    const split = computeSplit(1000);
    expect(split.deposit).toBe(2000);
    expect(split.total).toBe(3000);
  });

  it("honours a different commission rate", () => {
    // The rate is read per call, so no module reload is needed.
    process.env.PLATFORM_COMMISSION_PERCENT = "15";

    const split = computeSplit(1000);
    expect(split.platform).toBe(150);
    expect(split.landlord).toBe(850);
    expect(split.commissionPercent).toBe(15);
  });

  it("falls back to 10% when the configured rate is nonsense", () => {
    // A misconfigured deployment must never charge a zero or negative
    // commission, nor more than the whole payment.
    for (const bad of ["-5", "abc", "150", ""]) {
      process.env.PLATFORM_COMMISSION_PERCENT = bad;
      expect(computeSplit(1000).commissionPercent).toBe(10);
    }
  });

  it("rejects a non-positive or non-finite rent", () => {
    expect(() => computeSplit(0)).toThrow();
    expect(() => computeSplit(-100)).toThrow();
    expect(() => computeSplit(Number.NaN)).toThrow();
    expect(() => computeSplit(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("pesewa conversion", () => {
  it("converts to and from Paystack's minor units", () => {
    expect(toPesewas(1000)).toBe(100_000);
    expect(toPesewas(12.34)).toBe(1234);
    expect(fromPesewas(100_000)).toBe(1000);
    expect(fromPesewas(1234)).toBe(12.34);
  });

  it("round-trips without drift", () => {
    for (const amount of [0.01, 1, 99.99, 1234.56, 18_000]) {
      expect(fromPesewas(toPesewas(amount))).toBe(amount);
    }
  });
});

describe("formatGHS", () => {
  it("formats amounts as Ghana cedis", () => {
    // Non-breaking spaces vary by ICU build, so match on the parts.
    expect(formatGHS(1000)).toContain("1,000");
    expect(formatGHS(1000)).toMatch(/GH|₵/);
  });

  it("does not throw on a non-finite amount", () => {
    expect(() => formatGHS(Number.NaN)).not.toThrow();
  });
});
