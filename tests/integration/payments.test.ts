import { createHmac } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as webhook } from "@/app/api/payments/webhook/route";
import { POST as initialize } from "@/app/api/payments/initialize/route";
import { Payment } from "@/models/Payment";
import { Booking } from "@/models/Booking";
import { Property } from "@/models/Property";
import {
  createProperty,
  createUser,
  makeRequest,
  readResponse,
  resetDatabase,
  syncIndexes,
} from "../helpers";

const SECRET = "sk_test_integration_webhook_key";

/** Builds a signed webhook request, exactly as Paystack would send it. */
function webhookRequest(event: unknown, key = SECRET): Request {
  const raw = JSON.stringify(event);
  return new Request("http://localhost:3000/api/payments/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": createHmac("sha512", key).update(raw).digest("hex"),
    },
    body: raw,
  });
}

/** Seeds a pending payment against a real booking and returns the pieces. */
async function seedPendingPayment(amount = 1000) {
  const landlord = await createUser({
    role: "landlord",
    paystackSubaccount: "ACCT_test123",
  });
  const tenant = await createUser({ role: "tenant" });
  const property = await createProperty(landlord.id, { price: amount });

  const booking = await Booking.create({
    tenant: tenant.id,
    property: property._id,
    landlord: landlord.id,
    status: "pending",
    moveInDate: new Date(Date.now() + 86_400_000),
    amount,
  });

  const payment = await Payment.create({
    tenant: tenant.id,
    landlord: landlord.id,
    property: property._id,
    booking: booking._id,
    amount,
    currency: "GHS",
    status: "pending",
    reference: "RF-TEST-REFERENCE-0001",
    splitBreakdown: {
      total: amount,
      platform: amount * 0.1,
      landlord: amount * 0.9,
      commissionPercent: 10,
      rent: amount,
      deposit: 0,
    },
  });

  return { landlord, tenant, property, booking, payment };
}

describe("payment webhook", () => {
  beforeAll(syncIndexes);
  beforeEach(async () => {
    await resetDatabase();
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
  });

  const successEvent = (reference: string, amountPesewas: number) => ({
    event: "charge.success",
    data: {
      id: 12345,
      reference,
      amount: amountPesewas,
      currency: "GHS",
      status: "success",
      channel: "card",
      paid_at: new Date().toISOString(),
    },
  });

  it("rejects a request with no signature", async () => {
    const response = await webhook(
      new Request("http://localhost:3000/api/payments/webhook", {
        method: "POST",
        body: JSON.stringify(successEvent("RF-TEST-REFERENCE-0001", 100_000)),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a signature made with the wrong key", async () => {
    await seedPendingPayment();

    const response = await webhook(
      webhookRequest(
        successEvent("RF-TEST-REFERENCE-0001", 100_000),
        "sk_test_attacker_key",
      ),
    );

    expect(response.status).toBe(401);

    // Critically, the payment was not marked paid.
    const payment = await Payment.findOne({ reference: "RF-TEST-REFERENCE-0001" });
    expect(payment!.status).toBe("pending");
  });

  it("settles the payment and confirms the booking on charge.success", async () => {
    const { booking, property } = await seedPendingPayment();

    const response = await webhook(
      webhookRequest(successEvent("RF-TEST-REFERENCE-0001", 100_000)),
    );
    expect(response.status).toBe(200);

    const payment = await Payment.findOne({ reference: "RF-TEST-REFERENCE-0001" });
    expect(payment!.status).toBe("paid");
    expect(payment!.paidAt).toBeTruthy();

    // The booking is confirmed by the webhook, not by the browser.
    expect((await Booking.findById(booking._id))!.status).toBe("confirmed");
    // And the listing comes off the market.
    expect((await Property.findById(property._id))!.status).toBe("rented");
  });

  it("is idempotent: a duplicate delivery changes nothing", async () => {
    await seedPendingPayment();

    const first = await webhook(
      webhookRequest(successEvent("RF-TEST-REFERENCE-0001", 100_000)),
    );
    const firstBody = await first.json();
    expect(firstBody.data.applied).toBe(true);

    // Paystack retries deliver the same event again.
    const second = await webhook(
      webhookRequest(successEvent("RF-TEST-REFERENCE-0001", 100_000)),
    );
    const secondBody = await second.json();

    expect(second.status).toBe(200);
    expect(secondBody.data.applied).toBe(false);
    expect(secondBody.data.reason).toBe("already-settled");

    // Still exactly one payment record, still paid once.
    expect(await Payment.countDocuments({ reference: "RF-TEST-REFERENCE-0001" })).toBe(1);
  });

  it("survives concurrent deliveries of the same event", async () => {
    const { booking } = await seedPendingPayment();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        webhook(webhookRequest(successEvent("RF-TEST-REFERENCE-0001", 100_000))).then(
          (response) => response.json(),
        ),
      ),
    );

    // Exactly one of the concurrent deliveries did the work.
    const applied = results.filter((result) => result.data.applied);
    expect(applied).toHaveLength(1);

    expect((await Booking.findById(booking._id))!.status).toBe("confirmed");
  });

  it("refuses to settle when the paid amount is short", async () => {
    await seedPendingPayment(1000);

    // A tampered event claiming only GHS 1 was paid.
    await webhook(webhookRequest(successEvent("RF-TEST-REFERENCE-0001", 100)));

    const payment = await Payment.findOne({ reference: "RF-TEST-REFERENCE-0001" });
    expect(payment!.status).toBe("failed");
    expect(payment!.failureReason).toContain("mismatch");
  });

  it("marks a payment failed on charge.failed", async () => {
    await seedPendingPayment();

    await webhook(
      webhookRequest({
        event: "charge.failed",
        data: {
          reference: "RF-TEST-REFERENCE-0001",
          amount: 100_000,
          status: "failed",
          gateway_response: "Insufficient funds",
        },
      }),
    );

    const payment = await Payment.findOne({ reference: "RF-TEST-REFERENCE-0001" });
    expect(payment!.status).toBe("failed");
    expect(payment!.failureReason).toBe("Insufficient funds");
  });

  it("acknowledges an unknown reference without creating anything", async () => {
    const response = await webhook(
      webhookRequest(successEvent("RF-DOES-NOT-EXIST", 100_000)),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.reason).toBe("unknown-reference");
    expect(await Payment.countDocuments({})).toBe(0);
  });

  it("ignores event types it does not handle", async () => {
    const response = await webhook(
      webhookRequest({
        event: "subscription.create",
        data: { reference: "RF-TEST-REFERENCE-0001" },
      }),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).data.ignored).toBe(true);
  });

  it("rejects a malformed body even when correctly signed", async () => {
    const raw = "this is not json";
    const response = await webhook(
      new Request("http://localhost:3000/api/payments/webhook", {
        method: "POST",
        headers: {
          "x-paystack-signature": createHmac("sha512", SECRET)
            .update(raw)
            .digest("hex"),
        },
        body: raw,
      }),
    );

    expect(response.status).toBe(400);
  });
});

describe("payment initialization", () => {
  beforeAll(syncIndexes);
  beforeEach(async () => {
    await resetDatabase();
    process.env.PAYSTACK_SECRET_KEY = SECRET;
    process.env.PAYMENT_INCLUDE_DEPOSIT = "false";
  });
  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  /** Stubs Paystack's initialize endpoint and captures what we sent it. */
  function stubPaystack() {
    const calls: { url: string; body: Record<string, unknown> }[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init.body)) as Record<string, unknown>,
        });
        return new Response(
          JSON.stringify({
            status: true,
            message: "Authorization URL created",
            data: {
              authorization_url: "https://checkout.paystack.com/test",
              access_code: "test_code",
              reference: "RF-GENERATED",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    return calls;
  }

  it("computes the amount from the property, ignoring the client", async () => {
    const calls = stubPaystack();
    const { booking } = await seedPendingPayment(2000);
    // Reuse the seeded booking but delete the pre-made payment row.
    await Payment.deleteMany({});

    const { status } = await readResponse(
      await initialize(
        makeRequest("/api/payments/initialize", {
          method: "POST",
          token: (await tenantTokenFor(booking)).token,
          // A hostile client trying to pay one pesewa.
          body: { bookingId: booking._id.toString(), amount: 1 },
        }),
      ),
    );

    expect(status).toBe(200);
    // Paystack was asked for the real amount in pesewas, not the client's.
    expect(calls[0]!.body.amount).toBe(200_000);
    expect(calls[0]!.body.currency).toBe("GHS");
  });

  it("routes the landlord's share to their subaccount", async () => {
    const calls = stubPaystack();
    const { booking, landlord } = await seedPendingPayment(1000);
    await Payment.deleteMany({});

    await initialize(
      makeRequest("/api/payments/initialize", {
        method: "POST",
        token: (await tenantTokenFor(booking)).token,
        body: { bookingId: booking._id.toString() },
      }),
    );

    expect(calls[0]!.body.subaccount).toBe("ACCT_test123");
    // The landlord bears the fees, so the tenant pays the listed amount.
    expect(calls[0]!.body.bearer).toBe("subaccount");
    expect(landlord.role).toBe("landlord");
  });

  it("records a pending payment with the correct 90/10 split", async () => {
    stubPaystack();
    const { booking } = await seedPendingPayment(1000);
    await Payment.deleteMany({});

    await initialize(
      makeRequest("/api/payments/initialize", {
        method: "POST",
        token: (await tenantTokenFor(booking)).token,
        body: { bookingId: booking._id.toString() },
      }),
    );

    const payment = await Payment.findOne({ booking: booking._id });
    expect(payment!.status).toBe("pending");
    expect(payment!.amount).toBe(1000);
    expect(payment!.splitBreakdown.platform).toBe(100);
    expect(payment!.splitBreakdown.landlord).toBe(900);
  });

  it("refuses to let a tenant pay for someone else's booking", async () => {
    stubPaystack();
    const { booking } = await seedPendingPayment();
    await Payment.deleteMany({});
    const attacker = await createUser({ role: "tenant" });

    const { status } = await readResponse(
      await initialize(
        makeRequest("/api/payments/initialize", {
          method: "POST",
          token: attacker.token,
          body: { bookingId: booking._id.toString() },
        }),
      ),
    );

    expect(status).toBe(403);
  });

  it("refuses when the landlord has no payout account", async () => {
    stubPaystack();
    const landlord = await createUser({ role: "landlord" });
    const tenant = await createUser({ role: "tenant" });
    const property = await createProperty(landlord.id);
    const booking = await Booking.create({
      tenant: tenant.id,
      property: property._id,
      landlord: landlord.id,
      status: "pending",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });

    const { status, body } = await readResponse(
      await initialize(
        makeRequest("/api/payments/initialize", {
          method: "POST",
          token: tenant.token,
          body: { bookingId: booking._id.toString() },
        }),
      ),
    );

    expect(status).toBe(409);
    expect(body.success).toBe(false);
  });

  it("refuses to charge twice for a settled booking", async () => {
    stubPaystack();
    const { booking } = await seedPendingPayment();
    await Payment.updateMany({}, { $set: { status: "paid" } });

    const { status } = await readResponse(
      await initialize(
        makeRequest("/api/payments/initialize", {
          method: "POST",
          token: (await tenantTokenFor(booking)).token,
          body: { bookingId: booking._id.toString() },
        }),
      ),
    );

    expect(status).toBe(409);
  });

  it("rejects a landlord trying to initialise a payment", async () => {
    stubPaystack();
    const { booking, landlord } = await seedPendingPayment();
    await Payment.deleteMany({});

    const { status } = await readResponse(
      await initialize(
        makeRequest("/api/payments/initialize", {
          method: "POST",
          token: landlord.token,
          body: { bookingId: booking._id.toString() },
        }),
      ),
    );

    expect(status).toBe(403);
  });
});

/** Re-issues a token for whichever tenant owns the given booking. */
async function tenantTokenFor(booking: { tenant: unknown }) {
  const { User } = await import("@/models/User");
  const { signToken } = await import("@/lib/auth");
  const user = await User.findById(booking.tenant);
  return {
    token: await signToken({
      sub: user!._id.toString(),
      email: user!.email,
      role: user!.role,
    }),
  };
}
