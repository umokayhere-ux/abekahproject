import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Registration must not create an account it cannot then issue a token for.
 *
 * Reported in the field: with `JWT_SECRET` unset, sign-up created the user and
 * *then* threw while signing, so the caller was told sign-up failed while the
 * account quietly existed — and retrying hit "email already exists".
 *
 * The database layer is stubbed so the ordering can be asserted without a real
 * MongoDB: if `User.create` is ever reached, these fail.
 */

const createCalls: unknown[] = [];

vi.mock("@/lib/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db")>("@/lib/db");
  return { ...actual, connectDB: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/lib/seed-admin", () => ({
  ensureAdminSeeded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/models/User", () => ({
  User: {
    findOne: vi.fn(() => ({ select: vi.fn().mockResolvedValue(null) })),
    create: vi.fn(async (doc: unknown) => {
      createCalls.push(doc);
      return doc;
    }),
  },
}));

// A single import suffices: `env.jwtSecret` is a lazy getter read at call
// time, so the route module never captures the value at import.
const { POST } = await import("@/app/api/auth/register/route");

const validSignup = {
  name: "umokay here",
  email: "umokay@example.com",
  password: "Password123",
};

function signupRequest(body: object = validSignup) {
  return new Request("http://localhost:3000/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("registration with a broken JWT_SECRET", () => {
  const original = process.env.JWT_SECRET;

  beforeEach(() => {
    createCalls.length = 0;
  });

  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  it("creates no account when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;

    const response = await POST(signupRequest());

    expect(response.status).toBe(503);
    // The whole point: nothing was written.
    expect(createCalls).toHaveLength(0);
  });

  it("creates no account when JWT_SECRET is too short", async () => {
    process.env.JWT_SECRET = "too-short";

    const response = await POST(signupRequest());

    expect(response.status).toBe(503);
    expect(createCalls).toHaveLength(0);
  });

  it("names JWT_SECRET so the operator knows what to fix", async () => {
    delete process.env.JWT_SECRET;

    const body = await (await POST(signupRequest())).json();

    expect(body.message).toContain("JWT_SECRET");
  });

  it("still rejects invalid input before reporting a config problem", async () => {
    delete process.env.JWT_SECRET;

    const response = await POST(signupRequest({ ...validSignup, email: "nope" }));

    // Validation runs first, so a user with a typo gets a useful field error
    // rather than an infrastructure message.
    expect(response.status).toBe(422);
    expect(createCalls).toHaveLength(0);
  });

  it("still refuses an admin sign-up before anything else", async () => {
    delete process.env.JWT_SECRET;

    const response = await POST(
      signupRequest({ ...validSignup, role: "admin" }),
    );

    // The privilege boundary is checked first and is unaffected by config.
    expect(response.status).toBe(403);
    expect(createCalls).toHaveLength(0);
  });
});
