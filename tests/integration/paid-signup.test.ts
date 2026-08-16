import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { settleSuccessfulPayment, markPaymentFailed } from "@/lib/settle";
import { User } from "@/models/User";
import { Payment } from "@/models/Payment";
import { PendingRegistration } from "@/models/PendingRegistration";
import {
  expectData,
  makeRequest,
  readResponse,
  resetDatabase,
  syncIndexes,
} from "../helpers";
import type { VerifiedTransaction } from "@/lib/paystack";

/**
 * Landlords pay before an account exists.
 *
 * The property that matters throughout: a declined, abandoned, or forged
 * payment must leave **no user row behind**. The account is created only by
 * the settlement path.
 */

const signup = {
  name: "Kwame Asante",
  email: "kwame@landlord.test",
  password: "Password123",
  role: "landlord",
};

/** Stubs Paystack's initialize endpoint. */
function stubPaystackInitialize() {
  const calls: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          status: true,
          message: "ok",
          data: {
            authorization_url: "https://checkout.paystack.com/test",
            access_code: "ACCESS_TEST",
            reference: "ignored",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }),
  );
  return calls;
}

/** A successful Paystack transaction for the given reference and amount. */
const successFor = (reference: string, cedis: number): VerifiedTransaction => ({
  id: 999,
  status: "success",
  reference,
  amount: cedis * 100,
  currency: "GHS",
  channel: "mobile_money",
  paid_at: new Date().toISOString(),
});

describe("landlord signs up and pays", () => {
  beforeAll(syncIndexes);

  beforeEach(async () => {
    await resetDatabase();
    await PendingRegistration.deleteMany({});
    process.env.PAYSTACK_SECRET_KEY = "sk_test_paid_signup";
    process.env.LANDLORD_REGISTRATION_FEE_GHS = "50";
  });

  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  it("creates no user, only a pending record, and returns a checkout", async () => {
    stubPaystackInitialize();

    const { status, body } = await readResponse<{
      requiresPayment: boolean;
      authorizationUrl: string;
      accessCode: string;
      reference: string;
      amount: number;
    }>(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );

    expect(status).toBe(201);
    const data = expectData(body);
    expect(data.requiresPayment).toBe(true);
    expect(data.accessCode).toBe("ACCESS_TEST");
    expect(data.amount).toBe(50);

    // The point of the whole design: no account yet.
    expect(await User.countDocuments({ email: signup.email })).toBe(0);
    expect(await PendingRegistration.countDocuments({})).toBe(1);
  });

  it("returns no session token before payment", async () => {
    stubPaystackInitialize();

    const { body } = await readResponse(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );

    // A token here would be a signed-in user with no account behind it.
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("charges the fee to the platform, with no subaccount split", async () => {
    const calls = stubPaystackInitialize();

    await register(
      makeRequest("/api/auth/register", { method: "POST", body: signup }),
    );

    expect(calls[0]!.amount).toBe(5000); // pesewas
    expect(calls[0]!.currency).toBe("GHS");
    // The whole fee goes to the platform.
    expect(calls[0]!.subaccount).toBeUndefined();
    expect(calls[0]!.bearer).toBeUndefined();
  });

  it("never stores the password in plain text", async () => {
    stubPaystackInitialize();

    await register(
      makeRequest("/api/auth/register", { method: "POST", body: signup }),
    );

    const pending = await PendingRegistration.findOne({
      email: signup.email,
    }).select("+password");

    expect(pending!.password).not.toBe(signup.password);
    expect(pending!.password).toMatch(/^\$2[aby]\$12\$/);
  });

  it("creates the account when the payment settles", async () => {
    stubPaystackInitialize();

    const { body } = await readResponse<{ reference: string }>(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );
    const { reference } = expectData(body);

    const result = await settleSuccessfulPayment(successFor(reference, 50));
    expect(result.applied).toBe(true);

    const created = await User.findOne({ email: signup.email });
    expect(created).toBeTruthy();
    expect(created!.role).toBe("landlord");
    // Paid for at sign-up, so listing is unlocked immediately.
    expect(created!.registrationFeePaid).toBe(true);

    // The pending record is consumed.
    expect(await PendingRegistration.countDocuments({})).toBe(0);

    // And the fee is recorded against the new account.
    const payment = await Payment.findOne({ reference });
    expect(payment!.status).toBe("paid");
    expect(payment!.purpose).toBe("registration_fee");
    expect(payment!.splitBreakdown.platform).toBe(50);
    expect(payment!.splitBreakdown.landlord).toBe(0);
  });

  it("lets the landlord sign in with the password they chose", async () => {
    stubPaystackInitialize();

    const { body } = await readResponse<{ reference: string }>(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );
    await settleSuccessfulPayment(successFor(expectData(body).reference, 50));

    vi.unstubAllGlobals();

    const { status } = await readResponse(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: { email: signup.email, password: signup.password },
        }),
      ),
    );

    expect(status).toBe(200);
  });

  it("is idempotent across duplicate settlements", async () => {
    stubPaystackInitialize();

    const { body } = await readResponse<{ reference: string }>(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );
    const { reference } = expectData(body);

    const first = await settleSuccessfulPayment(successFor(reference, 50));
    const second = await settleSuccessfulPayment(successFor(reference, 50));

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    // Exactly one account, not two.
    expect(await User.countDocuments({ email: signup.email })).toBe(1);
  });

  it("survives concurrent settlements of the same reference", async () => {
    stubPaystackInitialize();

    const { body } = await readResponse<{ reference: string }>(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );
    const { reference } = expectData(body);

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        settleSuccessfulPayment(successFor(reference, 50)),
      ),
    );

    expect(results.filter((r) => r.applied)).toHaveLength(1);
    expect(await User.countDocuments({ email: signup.email })).toBe(1);
  });
});

describe("payments that do not succeed create nothing", () => {
  beforeAll(syncIndexes);

  beforeEach(async () => {
    await resetDatabase();
    await PendingRegistration.deleteMany({});
    process.env.PAYSTACK_SECRET_KEY = "sk_test_paid_signup";
    process.env.LANDLORD_REGISTRATION_FEE_GHS = "50";
  });

  afterEach(() => {
    delete process.env.PAYSTACK_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  async function startSignup() {
    stubPaystackInitialize();
    const { body } = await readResponse<{ reference: string }>(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );
    return expectData(body).reference;
  }

  it("creates no account when the charge fails", async () => {
    const reference = await startSignup();

    await markPaymentFailed(reference, "Insufficient funds");

    expect(await User.countDocuments({ email: signup.email })).toBe(0);
    // The pending record is dropped, releasing the email immediately.
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });

  it("creates no account when the amount paid is short", async () => {
    const reference = await startSignup();

    // A tampered event claiming GHS 1 was paid for a GHS 50 fee.
    const result = await settleSuccessfulPayment(successFor(reference, 1));

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("amount-mismatch");
    expect(await User.countDocuments({ email: signup.email })).toBe(0);
  });

  it("ignores a reference that was never issued", async () => {
    const result = await settleSuccessfulPayment(
      successFor("RF-NEVER-EXISTED", 50),
    );

    expect(result.applied).toBe(false);
    expect(result.reason).toBe("unknown-reference");
    expect(await User.countDocuments({})).toBe(0);
  });

  it("lets an abandoned sign-up be retried with the same email", async () => {
    await startSignup();
    const firstPending = await PendingRegistration.findOne({
      email: signup.email,
    });

    // The landlord gives up and starts again.
    stubPaystackInitialize();
    const { status } = await readResponse(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );

    expect(status).toBe(201);
    const pendings = await PendingRegistration.find({ email: signup.email });
    // Replaced, not duplicated.
    expect(pendings).toHaveLength(1);
    expect(pendings[0]!._id.toString()).not.toBe(firstPending!._id.toString());
  });

  it("refuses an email that already belongs to a real account", async () => {
    const reference = await startSignup();
    await settleSuccessfulPayment(successFor(reference, 50));

    stubPaystackInitialize();
    const { status } = await readResponse(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );

    expect(status).toBe(409);
  });

  it("refuses landlord sign-up when payments are not configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    const { status } = await readResponse(
      await register(
        makeRequest("/api/auth/register", { method: "POST", body: signup }),
      ),
    );

    // Better an honest 503 than a cryptic failure deeper in the flow.
    expect(status).toBe(503);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });
});

describe("tenants are unaffected", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("still creates a tenant immediately with a token", async () => {
    const { status, body } = await readResponse<{
      requiresPayment: boolean;
      token: string;
      user: { role: string };
    }>(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: { ...signup, email: "ama@tenant.test", role: "tenant" },
        }),
      ),
    );

    expect(status).toBe(201);
    const data = expectData(body);
    expect(data.requiresPayment).toBe(false);
    expect(data.token).toBeTruthy();
    expect(data.user.role).toBe("tenant");
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });

  it("still refuses an admin sign-up", async () => {
    const { status } = await readResponse(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: { ...signup, email: "x@test.local", role: "admin" },
        }),
      ),
    );

    expect(status).toBe(403);
    expect(await PendingRegistration.countDocuments({})).toBe(0);
  });
});
