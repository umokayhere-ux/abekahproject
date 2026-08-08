import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { User } from "@/models/User";
import { verifyToken, verifyPassword } from "@/lib/auth";
import { ensureAdminSeeded } from "@/lib/seed-admin";
import { connectDB } from "@/lib/db";
import {
  createUser,
  expectData,
  makeRequest,
  readResponse,
  resetDatabase,
  syncIndexes,
} from "../helpers";

interface AuthPayload {
  user: { _id: string; email: string; role: string; suspended: boolean };
  token: string;
}

describe("registration", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("creates a tenant by default and returns a usable token", async () => {
    const { status, body } = await readResponse<AuthPayload>(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: {
            name: "Ama Mensah",
            email: "Ama@Example.COM",
            password: "Password123",
          },
        }),
      ),
    );

    expect(status).toBe(201);
    const data = expectData(body);
    expect(data.user.role).toBe("tenant");
    // Email is normalised to lowercase.
    expect(data.user.email).toBe("ama@example.com");

    const payload = await verifyToken(data.token);
    expect(payload?.sub).toBe(data.user._id);
    expect(payload?.role).toBe("tenant");
  });

  it("creates a landlord when that role is requested", async () => {
    const { status, body } = await readResponse<AuthPayload>(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: {
            name: "Kwame Asante",
            email: "kwame@example.com",
            password: "Password123",
            role: "landlord",
          },
        }),
      ),
    );

    expect(status).toBe(201);
    expect(expectData(body).user.role).toBe("landlord");
  });

  it("never returns the password hash", async () => {
    const { body } = await readResponse<AuthPayload>(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: {
            name: "Ama Mensah",
            email: "ama@example.com",
            password: "Password123",
          },
        }),
      ),
    );

    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("Password123");
  });

  it("refuses to create an admin through public registration", async () => {
    const { status, body } = await readResponse(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: {
            name: "Impostor",
            email: "impostor@example.com",
            password: "Password123",
            role: "admin",
          },
        }),
      ),
    );

    expect(status).toBe(403);
    expect(body.success).toBe(false);
    // Crucially, no account of any kind was created.
    expect(await User.countDocuments({})).toBe(0);
  });

  it("rejects a duplicate email", async () => {
    await createUser({ email: "taken@example.com" });

    const { status, body } = await readResponse(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: {
            name: "Second User",
            email: "taken@example.com",
            password: "Password123",
          },
        }),
      ),
    );

    expect(status).toBe(409);
    expect(body.success).toBe(false);
  });

  it("rejects a weak password and an invalid email", async () => {
    const weak = await readResponse(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: { name: "Ama", email: "ama@example.com", password: "short" },
        }),
      ),
    );
    expect(weak.status).toBe(422);

    const badEmail = await readResponse(
      await register(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: { name: "Ama", email: "not-an-email", password: "Password123" },
        }),
      ),
    );
    expect(badEmail.status).toBe(422);
  });

  it("hashes the password with bcrypt at cost 12", async () => {
    await register(
      makeRequest("/api/auth/register", {
        method: "POST",
        body: {
          name: "Ama Mensah",
          email: "ama@example.com",
          password: "Password123",
        },
      }),
    );

    const user = await User.findOne({ email: "ama@example.com" }).select(
      "+password",
    );
    expect(user!.password).not.toBe("Password123");
    // bcrypt hashes encode their cost factor in the prefix.
    expect(user!.password).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("Password123", user!.password)).toBe(true);
  });
});

describe("login", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("signs in with correct credentials", async () => {
    await createUser({ email: "ama@example.com", password: "Password123" });

    const { status, body } = await readResponse<AuthPayload>(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: { email: "ama@example.com", password: "Password123" },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(expectData(body).token).toBeTruthy();
  });

  it("rejects an incorrect password without revealing which field was wrong", async () => {
    await createUser({ email: "ama@example.com", password: "Password123" });

    const wrongPassword = await readResponse(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: { email: "ama@example.com", password: "WrongPassword1" },
        }),
      ),
    );
    const unknownEmail = await readResponse(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: { email: "nobody@example.com", password: "Password123" },
        }),
      ),
    );

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical messages, so the endpoint cannot enumerate accounts.
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("rejects a suspended account with 403", async () => {
    await createUser({
      email: "suspended@example.com",
      password: "Password123",
      suspended: true,
    });

    const { status, body } = await readResponse(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: { email: "suspended@example.com", password: "Password123" },
        }),
      ),
    );

    expect(status).toBe(403);
    expect(body.success).toBe(false);
  });

  it("issues a token that expires in 30 days", async () => {
    await createUser({ email: "ama@example.com", password: "Password123" });

    const { body } = await readResponse<AuthPayload>(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: { email: "ama@example.com", password: "Password123" },
        }),
      ),
    );

    const [, rawPayload] = expectData(body).token.split(".");
    const claims = JSON.parse(
      Buffer.from(rawPayload!, "base64url").toString(),
    ) as { exp: number; iat: number };

    const thirtyDays = 30 * 24 * 60 * 60;
    expect(claims.exp - claims.iat).toBe(thirtyDays);
  });
});

describe("admin seeding", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("creates the configured admin and lets it sign in", async () => {
    process.env.ADMIN_EMAIL = "admin@rentfinder.test";
    process.env.ADMIN_PASSWORD = "AdminPassword123";
    process.env.ADMIN_NAME = "Test Admin";

    // The seeder memoises per module instance, so it is re-imported fresh.
    const { ensureAdminSeeded: seed } = await import(
      `@/lib/seed-admin?seed-${Date.now()}`
    );
    await seed();

    const admin = await User.findOne({ email: "admin@rentfinder.test" });
    expect(admin?.role).toBe("admin");
    expect(admin?.verified).toBe(true);

    const { status, body } = await readResponse<AuthPayload>(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: {
            email: "admin@rentfinder.test",
            password: "AdminPassword123",
          },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(expectData(body).user.role).toBe("admin");

    delete process.env.ADMIN_EMAIL;
    delete process.env.ADMIN_PASSWORD;
  });

  it("does nothing when the admin variables are absent", async () => {
    await connectDB();
    await ensureAdminSeeded();
    expect(await User.countDocuments({ role: "admin" })).toBe(0);
  });
});

describe("password reset", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("responds identically for known and unknown emails", async () => {
    await createUser({ email: "known@example.com" });

    const known = await readResponse(
      await forgotPassword(
        makeRequest("/api/auth/forgot-password", {
          method: "POST",
          body: { email: "known@example.com" },
        }),
      ),
    );
    const unknown = await readResponse(
      await forgotPassword(
        makeRequest("/api/auth/forgot-password", {
          method: "POST",
          body: { email: "unknown@example.com" },
        }),
      ),
    );

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it("stores only a hash of the reset token", async () => {
    await createUser({ email: "known@example.com" });

    await forgotPassword(
      makeRequest("/api/auth/forgot-password", {
        method: "POST",
        body: { email: "known@example.com" },
      }),
    );

    const user = await User.findOne({ email: "known@example.com" }).select(
      "+resetTokenHash +resetTokenExpiresAt",
    );
    // A SHA-256 hex digest, not a raw token.
    expect(user!.resetTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(user!.resetTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("resets the password and invalidates the token after one use", async () => {
    const { createHash, randomBytes } = await import("node:crypto");
    const user = await createUser({ email: "known@example.com" });

    // Plant a known token rather than intercepting the email.
    const rawToken = randomBytes(32).toString("hex");
    await User.updateOne(
      { _id: user.id },
      {
        $set: {
          resetTokenHash: createHash("sha256").update(rawToken).digest("hex"),
          resetTokenExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );

    const first = await readResponse(
      await resetPassword(
        makeRequest("/api/auth/reset-password", {
          method: "POST",
          body: {
            email: "known@example.com",
            token: rawToken,
            password: "BrandNewPassword1",
          },
        }),
      ),
    );
    expect(first.status).toBe(200);

    // The new password works.
    const signIn = await readResponse(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: {
            email: "known@example.com",
            password: "BrandNewPassword1",
          },
        }),
      ),
    );
    expect(signIn.status).toBe(200);

    // The same link cannot be replayed.
    const second = await readResponse(
      await resetPassword(
        makeRequest("/api/auth/reset-password", {
          method: "POST",
          body: {
            email: "known@example.com",
            token: rawToken,
            password: "AnotherPassword1",
          },
        }),
      ),
    );
    expect(second.status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const { createHash, randomBytes } = await import("node:crypto");
    const user = await createUser({ email: "known@example.com" });

    const rawToken = randomBytes(32).toString("hex");
    await User.updateOne(
      { _id: user.id },
      {
        $set: {
          resetTokenHash: createHash("sha256").update(rawToken).digest("hex"),
          // Already in the past.
          resetTokenExpiresAt: new Date(Date.now() - 1000),
        },
      },
    );

    const { status } = await readResponse(
      await resetPassword(
        makeRequest("/api/auth/reset-password", {
          method: "POST",
          body: {
            email: "known@example.com",
            token: rawToken,
            password: "BrandNewPassword1",
          },
        }),
      ),
    );

    expect(status).toBe(400);
  });
});
