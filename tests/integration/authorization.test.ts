import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as adminUsers, PATCH as adminPatchUsers, DELETE as adminDeleteUsers } from "@/app/api/admin/users/route";
import { GET as adminProperties } from "@/app/api/admin/properties/route";
import { GET as adminStats } from "@/app/api/admin/stats/route";
import { DELETE as adminReset } from "@/app/api/admin/reset/route";
import { PATCH as patchProperty, DELETE as deleteProperty } from "@/app/api/properties/[id]/route";
import { GET as getBooking } from "@/app/api/bookings/[id]/route";
import { GET as getMessages, POST as postMessage } from "@/app/api/conversations/[id]/messages/route";
import { Booking } from "@/models/Booking";
import { Conversation } from "@/models/Conversation";
import { User } from "@/models/User";
import {
  createProperty,
  createUser,
  makeRequest,
  params,
  readResponse,
  resetDatabase,
  syncIndexes,
} from "../helpers";

describe("admin API authorization", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  const adminRoutes = [
    { name: "GET /api/admin/users", call: adminUsers, path: "/api/admin/users" },
    {
      name: "GET /api/admin/properties",
      call: adminProperties,
      path: "/api/admin/properties",
    },
    { name: "GET /api/admin/stats", call: adminStats, path: "/api/admin/stats" },
  ];

  it("rejects unauthenticated requests with 401", async () => {
    for (const route of adminRoutes) {
      const { status } = await readResponse(
        await route.call(makeRequest(route.path)),
      );
      expect(status, route.name).toBe(401);
    }
  });

  it("rejects a tenant with 403", async () => {
    const tenant = await createUser({ role: "tenant" });

    for (const route of adminRoutes) {
      const { status } = await readResponse(
        await route.call(makeRequest(route.path, { token: tenant.token })),
      );
      expect(status, route.name).toBe(403);
    }
  });

  it("rejects a landlord with 403", async () => {
    const landlord = await createUser({ role: "landlord" });

    for (const route of adminRoutes) {
      const { status } = await readResponse(
        await route.call(makeRequest(route.path, { token: landlord.token })),
      );
      expect(status, route.name).toBe(403);
    }
  });

  it("allows an admin", async () => {
    const admin = await createUser({ role: "admin" });

    for (const route of adminRoutes) {
      const { status } = await readResponse(
        await route.call(makeRequest(route.path, { token: admin.token })),
      );
      expect(status, route.name).toBe(200);
    }
  });

  it("rejects a garbage or forged token", async () => {
    for (const token of ["garbage", "a.b.c", ""]) {
      const { status } = await readResponse(
        await adminUsers(makeRequest("/api/admin/users", { token })),
      );
      expect(status).toBe(401);
    }
  });

  it("rejects a token whose user has since been suspended", async () => {
    const admin = await createUser({ role: "admin" });
    await User.updateOne({ _id: admin.id }, { $set: { suspended: true } });

    const { status } = await readResponse(
      await adminUsers(makeRequest("/api/admin/users", { token: admin.token })),
    );
    expect(status).toBe(403);
  });

  it("rejects a token whose user has since been deleted", async () => {
    const admin = await createUser({ role: "admin" });
    await User.deleteOne({ _id: admin.id });

    const { status } = await readResponse(
      await adminUsers(makeRequest("/api/admin/users", { token: admin.token })),
    );
    expect(status).toBe(401);
  });

  it("rejects a token whose role no longer matches the database", async () => {
    // A user who was an admin, was demoted, but still holds the old token.
    const user = await createUser({ role: "admin" });
    await User.updateOne({ _id: user.id }, { $set: { role: "tenant" } });

    const { status } = await readResponse(
      await adminUsers(makeRequest("/api/admin/users", { token: user.token })),
    );
    expect(status).toBe(401);
  });
});

describe("property ownership", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("stops a landlord editing another landlord's property", async () => {
    const owner = await createUser({ role: "landlord" });
    const attacker = await createUser({ role: "landlord" });
    const property = await createProperty(owner.id, { title: "Owner's listing here" });

    const { status } = await readResponse(
      await patchProperty(
        makeRequest(`/api/properties/${property._id}`, {
          method: "PATCH",
          token: attacker.token,
          body: { price: 1 },
        }),
        params({ id: property._id.toString() }),
      ),
    );

    expect(status).toBe(403);
    // The listing is untouched.
    const unchanged = await (await import("@/models/Property")).Property.findById(
      property._id,
    );
    expect(unchanged!.price).toBe(1000);
  });

  it("stops a landlord deleting another landlord's property", async () => {
    const owner = await createUser({ role: "landlord" });
    const attacker = await createUser({ role: "landlord" });
    const property = await createProperty(owner.id);

    const { status } = await readResponse(
      await deleteProperty(
        makeRequest(`/api/properties/${property._id}`, {
          method: "DELETE",
          token: attacker.token,
        }),
        params({ id: property._id.toString() }),
      ),
    );

    expect(status).toBe(403);
    const { Property } = await import("@/models/Property");
    expect(await Property.countDocuments({ _id: property._id })).toBe(1);
  });

  it("lets the owner edit their own property", async () => {
    const owner = await createUser({ role: "landlord" });
    const property = await createProperty(owner.id);

    const { status } = await readResponse(
      await patchProperty(
        makeRequest(`/api/properties/${property._id}`, {
          method: "PATCH",
          token: owner.token,
          body: { price: 2500 },
        }),
        params({ id: property._id.toString() }),
      ),
    );

    expect(status).toBe(200);
  });

  it("lets an admin edit any property", async () => {
    const owner = await createUser({ role: "landlord" });
    const admin = await createUser({ role: "admin" });
    const property = await createProperty(owner.id);

    const { status } = await readResponse(
      await patchProperty(
        makeRequest(`/api/properties/${property._id}`, {
          method: "PATCH",
          token: admin.token,
          body: { price: 2500 },
        }),
        params({ id: property._id.toString() }),
      ),
    );

    expect(status).toBe(200);
  });

  it("does not let a landlord verify their own listing", async () => {
    const owner = await createUser({ role: "landlord" });
    const property = await createProperty(owner.id);

    await patchProperty(
      makeRequest(`/api/properties/${property._id}`, {
        method: "PATCH",
        token: owner.token,
        // `verified` is not an accepted field on this endpoint.
        body: { verified: true },
      }),
      params({ id: property._id.toString() }),
    );

    const { Property } = await import("@/models/Property");
    const after = await Property.findById(property._id);
    expect(after!.verified).toBe(false);
  });
});

describe("booking access", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("stops a tenant reading another tenant's booking", async () => {
    const landlord = await createUser({ role: "landlord" });
    const tenant = await createUser({ role: "tenant" });
    const otherTenant = await createUser({ role: "tenant" });
    const property = await createProperty(landlord.id);

    const booking = await Booking.create({
      tenant: tenant.id,
      property: property._id,
      landlord: landlord.id,
      status: "pending",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });

    const { status } = await readResponse(
      await getBooking(
        makeRequest(`/api/bookings/${booking._id}`, { token: otherTenant.token }),
        params({ id: booking._id.toString() }),
      ),
    );

    expect(status).toBe(403);
  });

  it("lets both participants and an admin read a booking", async () => {
    const landlord = await createUser({ role: "landlord" });
    const tenant = await createUser({ role: "tenant" });
    const admin = await createUser({ role: "admin" });
    const property = await createProperty(landlord.id);

    const booking = await Booking.create({
      tenant: tenant.id,
      property: property._id,
      landlord: landlord.id,
      status: "pending",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });

    for (const user of [tenant, landlord, admin]) {
      const { status } = await readResponse(
        await getBooking(
          makeRequest(`/api/bookings/${booking._id}`, { token: user.token }),
          params({ id: booking._id.toString() }),
        ),
      );
      expect(status, user.role).toBe(200);
    }
  });
});

describe("conversation membership", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("stops a non-participant reading or posting to a thread", async () => {
    const tenant = await createUser({ role: "tenant" });
    const landlord = await createUser({ role: "landlord" });
    const outsider = await createUser({ role: "tenant" });

    const conversation = await Conversation.create({
      participants: [tenant.id, landlord.id],
      lastMessage: "hello",
    });

    const read = await readResponse(
      await getMessages(
        makeRequest(`/api/conversations/${conversation._id}/messages`, {
          token: outsider.token,
        }),
        params({ id: conversation._id.toString() }),
      ),
    );
    expect(read.status).toBe(403);

    const write = await readResponse(
      await postMessage(
        makeRequest(`/api/conversations/${conversation._id}/messages`, {
          method: "POST",
          token: outsider.token,
          body: { text: "let me in" },
        }),
        params({ id: conversation._id.toString() }),
      ),
    );
    expect(write.status).toBe(403);
  });

  it("does not give admins a backdoor into private conversations", async () => {
    const tenant = await createUser({ role: "tenant" });
    const landlord = await createUser({ role: "landlord" });
    const admin = await createUser({ role: "admin" });

    const conversation = await Conversation.create({
      participants: [tenant.id, landlord.id],
      lastMessage: "hello",
    });

    const { status } = await readResponse(
      await getMessages(
        makeRequest(`/api/conversations/${conversation._id}/messages`, {
          token: admin.token,
        }),
        params({ id: conversation._id.toString() }),
      ),
    );

    expect(status).toBe(403);
  });

  it("lets a participant read the thread", async () => {
    const tenant = await createUser({ role: "tenant" });
    const landlord = await createUser({ role: "landlord" });

    const conversation = await Conversation.create({
      participants: [tenant.id, landlord.id],
      lastMessage: "hello",
    });

    const { status } = await readResponse(
      await getMessages(
        makeRequest(`/api/conversations/${conversation._id}/messages`, {
          token: tenant.token,
        }),
        params({ id: conversation._id.toString() }),
      ),
    );

    expect(status).toBe(200);
  });
});

describe("admin self-protection", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("refuses to suspend an admin account", async () => {
    const admin = await createUser({ role: "admin" });
    const otherAdmin = await createUser({ role: "admin" });

    const { status } = await readResponse(
      await adminPatchUsers(
        makeRequest("/api/admin/users", {
          method: "PATCH",
          token: admin.token,
          body: { userId: otherAdmin.id, action: "suspend" },
        }),
      ),
    );

    expect(status).toBe(400);
  });

  it("refuses to delete an admin's own account", async () => {
    const admin = await createUser({ role: "admin" });

    const { status } = await readResponse(
      await adminDeleteUsers(
        makeRequest(`/api/admin/users?userId=${admin.id}`, {
          method: "DELETE",
          token: admin.token,
        }),
      ),
    );

    expect(status).toBe(400);
    expect(await User.countDocuments({ _id: admin.id })).toBe(1);
  });
});

describe("reset endpoint guards", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("requires an admin token", async () => {
    const tenant = await createUser({ role: "tenant" });
    const landlord = await createUser({ role: "landlord" });

    for (const user of [tenant, landlord]) {
      const { status } = await readResponse(
        await adminReset(
          makeRequest("/api/admin/reset", {
            method: "DELETE",
            token: user.token,
            body: { scope: "full", confirm: "RESET" },
          }),
        ),
      );
      expect(status, user.role).toBe(403);
    }

    const anonymous = await readResponse(
      await adminReset(
        makeRequest("/api/admin/reset", {
          method: "DELETE",
          body: { scope: "full", confirm: "RESET" },
        }),
      ),
    );
    expect(anonymous.status).toBe(401);
  });

  it("refuses without the exact confirmation phrase", async () => {
    const admin = await createUser({ role: "admin" });
    const landlord = await createUser({ role: "landlord" });
    await createProperty(landlord.id);

    // Every near miss must be rejected, including case and whitespace variants.
    for (const confirm of ["reset", "Reset", " RESET", "RESET ", "", "YES", null]) {
      const { status } = await readResponse(
        await adminReset(
          makeRequest("/api/admin/reset", {
            method: "DELETE",
            token: admin.token,
            body: { scope: "properties", confirm },
          }),
        ),
      );
      expect(status, `confirm=${JSON.stringify(confirm)}`).toBe(400);
    }

    // Nothing was deleted by any of those attempts.
    const { Property } = await import("@/models/Property");
    expect(await Property.countDocuments({})).toBe(1);
  });

  it("rejects an unrecognised scope", async () => {
    const admin = await createUser({ role: "admin" });

    const { status } = await readResponse(
      await adminReset(
        makeRequest("/api/admin/reset", {
          method: "DELETE",
          token: admin.token,
          body: { scope: "everything", confirm: "RESET" },
        }),
      ),
    );

    expect(status).toBe(422);
  });

  it("performs the reset when properly authorised and confirmed", async () => {
    const admin = await createUser({ role: "admin" });
    const landlord = await createUser({ role: "landlord" });
    await createProperty(landlord.id);
    await createProperty(landlord.id, { title: "A second test listing here" });

    const { status } = await readResponse(
      await adminReset(
        makeRequest("/api/admin/reset", {
          method: "DELETE",
          token: admin.token,
          body: { scope: "properties", confirm: "RESET" },
        }),
      ),
    );

    expect(status).toBe(200);

    const { Property } = await import("@/models/Property");
    expect(await Property.countDocuments({})).toBe(0);
    // The admin account survives.
    expect(await User.countDocuments({ _id: admin.id })).toBe(1);
  });

  it("preserves admin accounts through a full reset", async () => {
    const admin = await createUser({ role: "admin" });
    await createUser({ role: "tenant" });
    await createUser({ role: "landlord" });

    await adminReset(
      makeRequest("/api/admin/reset", {
        method: "DELETE",
        token: admin.token,
        body: { scope: "full", confirm: "RESET" },
      }),
    );

    expect(await User.countDocuments({ role: "admin" })).toBe(1);
    expect(await User.countDocuments({ role: { $ne: "admin" } })).toBe(0);
  });
});
