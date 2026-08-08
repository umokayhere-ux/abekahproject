import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateReference, verifyWebhookSignature } from "@/lib/paystack";

const SECRET = "sk_test_webhook_signature_verification_key";

/** Produces the header Paystack would send for a given body. */
function sign(body: string, key = SECRET): string {
  return createHmac("sha512", key).update(body).digest("hex");
}

describe("verifyWebhookSignature", () => {
  beforeEach(() => {
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });

  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  const body = JSON.stringify({
    event: "charge.success",
    data: { reference: "RF-TEST-0001", amount: 100_000, status: "success" },
  });

  it("accepts a correctly signed payload", () => {
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
  });

  it("accepts an uppercase signature header", () => {
    expect(verifyWebhookSignature(body, sign(body).toUpperCase())).toBe(true);
  });

  it("rejects a missing signature", () => {
    expect(verifyWebhookSignature(body, null)).toBe(false);
    expect(verifyWebhookSignature(body, "")).toBe(false);
  });

  it("rejects a signature made with the wrong key", () => {
    // This is the attack that matters: anyone can POST to the webhook, but
    // without the secret they cannot produce a valid signature.
    expect(verifyWebhookSignature(body, sign(body, "sk_test_wrong_key"))).toBe(
      false,
    );
  });

  it("rejects a payload tampered with after signing", () => {
    const signature = sign(body);
    const tampered = body.replace("100000", "1");

    expect(verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it("rejects a signature of the wrong length", () => {
    expect(verifyWebhookSignature(body, "abc123")).toBe(false);
    expect(verifyWebhookSignature(body, sign(body).slice(0, -2))).toBe(false);
  });

  it("rejects a signature that is not hex", () => {
    expect(verifyWebhookSignature(body, "z".repeat(128))).toBe(false);
  });

  it("throws when no secret key is configured", () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    // Better to fail loudly than to silently accept unverified webhooks.
    expect(() => verifyWebhookSignature(body, sign(body))).toThrow();
  });
});

describe("generateReference", () => {
  it("produces a prefixed, unique reference", () => {
    const references = new Set(
      Array.from({ length: 500 }, () => generateReference()),
    );

    expect(references.size).toBe(500);
    for (const reference of references) {
      expect(reference).toMatch(/^RF-[0-9A-Z]+-[0-9A-F]{16}$/);
    }
  });
});
