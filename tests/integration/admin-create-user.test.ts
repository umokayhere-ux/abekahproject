import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as adminCreateUser } from "@/app/api/admin/users/route";
import { POST as publicRegister } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { User } from "@/models/User";
import { Activity } from "@/models/Activity";
import {
  createUser,
  expectData,
  makeRequest,
  readResponse,
  resetDatabase,
  syncIndexes,
} from "../helpers";
import type { SafeUser } from "@/types";

/**
 * Creating an administrator is the platform's highest-privilege action.
 * It must be reachable *only* by an existing administrator — never by public
 * sign-up, and never by a request that merely claims the role.
 */

const newAccount = {
  name: "Second Admin",
  email: "second.admin@rentfinder.test",
  password: "Password123",
};

describe("admin creates accounts", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("lets an admin create another admin", async () => {
    const admin = await createUser({ role: "admin" });

    const { status, body } = await readResponse<{ user: SafeUser }>(
      await adminCreateUser(
        makeRequest("/api/admin/users", {
          method: "POST",
          token: admin.token,
          body: { ...newAccount, role: "admin" },
        }),
      ),
    );

    expect(status).toBe(201);
    const created = expectData(body).user;
    expect(created.role).toBe("admin");
    // Admins are usable immediately.
    expect(created.verified).toBe(true);
    expect(created.suspended).toBe(false);
  });

  it("gives the new admin a working sign-in", async () => {
    const admin = await createUser({ role: "admin" });

    await adminCreateUser(
      makeRequest("/api/admin/users", {
        method: "POST",
        token: admin.token,
        body: { ...newAccount, role: "admin" },
      }),
    );

    const { status, body } = await readResponse<{ user: SafeUser }>(
      await login(
        makeRequest("/api/auth/login", {
          method: "POST",
          body: { email: newAccount.email, password: newAccount.password },
        }),
      ),
    );

    expect(status).toBe(200);
    expect(expectData(body).user.role).toBe("admin");
  });

  it("never returns or stores the password in plain text", async () => {
    const admin = await createUser({ role: "admin" });

    const { body } = await readResponse(
      await adminCreateUser(
        makeRequest("/api/admin/users", {
          method: "POST",
          token: admin.token,
          body: { ...newAccount, role: "admin" },
        }),
      ),
    );

    expect(JSON.stringify(body)).not.toContain(newAccount.password);

    const stored = await User.findOne({ email: newAccount.email }).select(
      "+password",
    );
    expect(stored!.password).toMatch(/^\$2[aby]\$12\$/);
  });

  it("can also create tenants and landlords", async () => {
    const admin = await createUser({ role: "admin" });

    for (const role of ["tenant", "landlord"] as const) {
      const { status, body } = await readResponse<{ user: SafeUser }>(
        await adminCreateUser(
          makeRequest("/api/admin/users", {
            method: "POST",
            token: admin.token,
            body: {
              ...newAccount,
              email: `${role}@rentfinder.test`,
              role,
            },
          }),
        ),
      );

      expect(status, role).toBe(201);
      expect(expectData(body).user.role).toBe(role);
    }
  });

  it("waives the listing fee for an admin-created landlord", async () => {
    const admin = await createUser({ role: "admin" });

    await adminCreateUser(
      makeRequest("/api/admin/users", {
        method: "POST",
        token: admin.token,
        body: { ...newAccount, email: "onboarded@test.local", role: "landlord" },
      }),
    );

    // Deliberately onboarded by the platform, so not charged.
    const created = await User.findOne({ email: "onboarded@test.local" });
    expect(created!.registrationFeePaid).toBe(true);
  });

  it("records the appointment in the audit log", async () => {
    const admin = await createUser({ role: "admin" });

    await adminCreateUser(
      makeRequest("/api/admin/users", {
        method: "POST",
        token: admin.token,
        body: { ...newAccount, role: "admin" },
      }),
    );

    const entry = await Activity.findOne({ action: "admin.created" });
    expect(entry).toBeTruthy();
    expect(entry!.message).toContain(newAccount.email);
    // The password must not leak into the trail.
    expect(JSON.stringify(entry!.toObject())).not.toContain(newAccount.password);
  });
});

describe("who may create an admin", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("refuses an unauthenticated request", async () => {
    const { status } = await readResponse(
      await adminCreateUser(
        makeRequest("/api/admin/users", {
          method: "POST",
          body: { ...newAccount, role: "admin" },
        }),
      ),
    );

    expect(status).toBe(401);
    expect(await User.countDocuments({})).toBe(0);
  });

  it("refuses a tenant and a landlord", async () => {
    for (const role of ["tenant", "landlord"] as const) {
      await resetDatabase();
      const user = await createUser({ role });

      const { status } = await readResponse(
        await adminCreateUser(
          makeRequest("/api/admin/users", {
            method: "POST",
            token: user.token,
            body: { ...newAccount, role: "admin" },
          }),
        ),
      );

      expect(status, role).toBe(403);
      // No admin was created by the attempt.
      expect(await User.countDocuments({ role: "admin" })).toBe(0);
    }
  });

  it("still refuses admin through public registration", async () => {
    // The public boundary is unchanged by this endpoint existing.
    const { status } = await readResponse(
      await publicRegister(
        makeRequest("/api/auth/register", {
          method: "POST",
          body: { ...newAccount, role: "admin" },
        }),
      ),
    );

    expect(status).toBe(403);
    expect(await User.countDocuments({ role: "admin" })).toBe(0);
  });

  it("rejects a duplicate email", async () => {
    const admin = await createUser({ role: "admin" });
    await createUser({ email: newAccount.email, role: "tenant" });

    const { status } = await readResponse(
      await adminCreateUser(
        makeRequest("/api/admin/users", {
          method: "POST",
          token: admin.token,
          body: { ...newAccount, role: "admin" },
        }),
      ),
    );

    expect(status).toBe(409);
  });

  it("validates the input", async () => {
    const admin = await createUser({ role: "admin" });

    const { status, body } = await readResponse(
      await adminCreateUser(
        makeRequest("/api/admin/users", {
          method: "POST",
          token: admin.token,
          body: { name: "x", email: "nope", password: "short", role: "admin" },
        }),
      ),
    );

    expect(status).toBe(422);
    if (!body.success) {
      expect(Object.keys(body.errors ?? {})).toEqual(
        expect.arrayContaining(["name", "email", "password"]),
      );
    }
  });

  it("rejects an unrecognised role", async () => {
    const admin = await createUser({ role: "admin" });

    const { status } = await readResponse(
      await adminCreateUser(
        makeRequest("/api/admin/users", {
          method: "POST",
          token: admin.token,
          body: { ...newAccount, role: "superuser" },
        }),
      ),
    );

    expect(status).toBe(422);
  });
});
