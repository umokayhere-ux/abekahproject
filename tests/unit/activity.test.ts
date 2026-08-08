import { describe, expect, it, vi } from "vitest";

/**
 * The audit log must never become a place where secrets end up. `logActivity`
 * filters its metadata defensively, so this asserts the filter rather than
 * trusting every future caller to be careful.
 */

// The write path is stubbed so the filter can be tested without a database.
const created: Record<string, unknown>[] = [];

vi.mock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/models/Activity", () => ({
  Activity: {
    create: vi.fn(async (doc: Record<string, unknown>) => {
      created.push(doc);
      return doc;
    }),
  },
}));

const { logActivity, ACTIONS } = await import("@/lib/activity");

describe("audit metadata redaction", () => {
  it("drops password, token, and secret fields", async () => {
    created.length = 0;

    await logActivity({
      action: ACTIONS.LOGIN,
      message: "signed in",
      metadata: {
        // Every one of these must be stripped.
        password: "Password123",
        newPassword: "Password456",
        currentPassword: "Password789",
        token: "eyJhbGciOi...",
        jwt: "eyJhbGciOi...",
        rf_token: "eyJhbGciOi...",
        authorization: "Bearer abc",
        secret: "shh",
        secretKey: "sk_live_123",
        apiSecret: "cloudinary-secret",
        resetToken: "abc123",
        resetTokenHash: "def456",
        bankAccountNumber: "0123456789",
        // These are fine to keep.
        city: "Accra",
        amount: 1000,
      },
    });

    const entry = created[0]!;
    const metadata = entry.metadata as Record<string, unknown>;

    expect(metadata).toEqual({ city: "Accra", amount: 1000 });

    const serialised = JSON.stringify(entry);
    expect(serialised).not.toContain("Password123");
    expect(serialised).not.toContain("sk_live_123");
    expect(serialised).not.toContain("0123456789");
  });

  it("matches key names regardless of case or separators", async () => {
    created.length = 0;

    await logActivity({
      action: ACTIONS.LOGIN,
      metadata: {
        PASSWORD: "x",
        "new-password": "y",
        Secret_Key: "z",
        API_SECRET: "w",
        keep: "this",
      },
    });

    expect(created[0]!.metadata).toEqual({ keep: "this" });
  });

  it("omits metadata entirely when everything was filtered out", async () => {
    created.length = 0;

    await logActivity({
      action: ACTIONS.LOGIN,
      metadata: { password: "x", token: "y" },
    });

    expect(created[0]!.metadata).toBeUndefined();
  });

  it("never throws, so a logging failure cannot break the request", async () => {
    const { Activity } = await import("@/models/Activity");
    vi.mocked(Activity.create).mockRejectedValueOnce(new Error("db is down"));

    await expect(
      logActivity({ action: ACTIONS.LOGIN, message: "signed in" }),
    ).resolves.toBeUndefined();
  });
});
