import { describe, expect, it } from "vitest";
import { normalizeMomoNumber } from "@/lib/validate";
import { isMobileMoney, type PaystackBank } from "@/lib/paystack";

/**
 * Mobile money is how most Ghanaian landlords expect to be paid, so the
 * number handling has to accept what people actually type.
 */
describe("normalizeMomoNumber", () => {
  it("accepts the local form unchanged", () => {
    expect(normalizeMomoNumber("0244123456")).toBe("0244123456");
    expect(normalizeMomoNumber("0551234567")).toBe("0551234567");
  });

  it("converts international forms to local", () => {
    // Paystack identifies a Ghanaian wallet by its local ten-digit number.
    expect(normalizeMomoNumber("+233244123456")).toBe("0244123456");
    expect(normalizeMomoNumber("233244123456")).toBe("0244123456");
  });

  it("adds a missing leading zero", () => {
    expect(normalizeMomoNumber("244123456")).toBe("0244123456");
  });

  it("tolerates spaces, dashes, and brackets", () => {
    for (const input of [
      "024 412 3456",
      "024-412-3456",
      "+233 24 412 3456",
      "(024) 412 3456",
    ]) {
      expect(normalizeMomoNumber(input), input).toBe("0244123456");
    }
  });

  it("covers all three Ghanaian networks", () => {
    // MTN, Telecel/Vodafone, and AirtelTigo prefixes.
    for (const prefix of ["024", "054", "055", "059", "020", "050", "027", "057", "026", "056"]) {
      const number = `${prefix}1234567`;
      expect(normalizeMomoNumber(number), number).toBe(number);
    }
  });

  it("rejects numbers that are the wrong length", () => {
    expect(normalizeMomoNumber("024412345")).toBeNull();
    expect(normalizeMomoNumber("02441234567")).toBeNull();
    expect(normalizeMomoNumber("")).toBeNull();
  });

  it("rejects non-Ghanaian and non-numeric input", () => {
    expect(normalizeMomoNumber("+14155551234")).toBeNull();
    expect(normalizeMomoNumber("not a number")).toBeNull();
    expect(normalizeMomoNumber("0244abc456")).toBeNull();
  });
});

describe("isMobileMoney", () => {
  const entry = (name: string, type: string): PaystackBank => ({
    name,
    type,
    code: "000",
    currency: "GHS",
  });

  it("recognises wallets by Paystack's type", () => {
    expect(isMobileMoney(entry("MTN Mobile Money", "mobile_money"))).toBe(true);
    // Tolerates label variations, since the exact string is Paystack's choice.
    expect(isMobileMoney(entry("Some Wallet", "mobile money"))).toBe(true);
    expect(isMobileMoney(entry("Some Wallet", "momo"))).toBe(true);
  });

  it("recognises the Ghanaian wallet brands by name", () => {
    // A fallback for when the type field is unhelpful.
    for (const name of [
      "MTN Mobile Money",
      "Vodafone Cash",
      "Telecel Cash",
      "AirtelTigo Money",
    ]) {
      expect(isMobileMoney(entry(name, "unknown")), name).toBe(true);
    }
  });

  it("does not mistake banks for wallets", () => {
    for (const name of [
      "Ghana Commercial Bank",
      "Absa Bank Ghana",
      "Fidelity Bank",
      "Ecobank Ghana",
      "Stanbic Bank",
      "Zenith Bank",
    ]) {
      expect(isMobileMoney(entry(name, "ghipss")), name).toBe(false);
    }
  });
});
