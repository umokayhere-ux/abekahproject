import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as listProperties, POST as createPropertyRoute } from "@/app/api/properties/route";
import { GET as getProperty, DELETE as deletePropertyRoute } from "@/app/api/properties/[id]/route";
import { POST as favorite, DELETE as unfavorite } from "@/app/api/properties/[id]/favorite/route";
import { POST as createBooking } from "@/app/api/bookings/route";
import { PATCH as patchBooking } from "@/app/api/bookings/[id]/route";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { User } from "@/models/User";
import {
  createProperty,
  createUser,
  expectData,
  makeRequest,
  params,
  readResponse,
  resetDatabase,
  syncIndexes,
} from "../helpers";
import type { Paginated, PropertyDTO } from "@/types";

describe("property CRUD", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  const validBody = {
    title: "Bright two bedroom in Osu",
    description:
      "A well-presented apartment close to the beach, with parking and 24-hour security.",
    price: 2500,
    type: "apartment",
    bedrooms: 2,
    bathrooms: 2,
    city: "Accra",
    state: "Greater Accra",
    address: "10 Oxford Street, Osu",
    images: [],
    amenities: ["Parking space"],
  };

  it("lets a landlord create a listing owned by themselves", async () => {
    const landlord = await createUser({ role: "landlord" });

    const { status, body } = await readResponse<{ property: PropertyDTO }>(
      await createPropertyRoute(
        makeRequest("/api/properties", {
          method: "POST",
          token: landlord.token,
          body: validBody,
        }),
      ),
    );

    expect(status).toBe(201);
    const created = expectData(body).property;
    expect(created.title).toBe(validBody.title);
    // New listings are never self-verified.
    expect(created.verified).toBe(false);
    expect(created.status).toBe("available");

    const stored = await Property.findById(created._id);
    expect(stored!.landlord.toString()).toBe(landlord.id);
  });

  it("ignores a landlord id supplied by the client", async () => {
    const landlord = await createUser({ role: "landlord" });
    const victim = await createUser({ role: "landlord" });

    const { body } = await readResponse<{ property: PropertyDTO }>(
      await createPropertyRoute(
        makeRequest("/api/properties", {
          method: "POST",
          token: landlord.token,
          // An attempt to create a listing under someone else's account.
          body: { ...validBody, landlord: victim.id },
        }),
      ),
    );

    const stored = await Property.findById(expectData(body).property._id);
    expect(stored!.landlord.toString()).toBe(landlord.id);
  });

  it("refuses to let a tenant create a listing", async () => {
    const tenant = await createUser({ role: "tenant" });

    const { status } = await readResponse(
      await createPropertyRoute(
        makeRequest("/api/properties", {
          method: "POST",
          token: tenant.token,
          body: validBody,
        }),
      ),
    );

    expect(status).toBe(403);
  });

  it("validates the submitted fields", async () => {
    const landlord = await createUser({ role: "landlord" });

    const { status, body } = await readResponse(
      await createPropertyRoute(
        makeRequest("/api/properties", {
          method: "POST",
          token: landlord.token,
          body: { ...validBody, title: "no", price: -5, bedrooms: 2.5 },
        }),
      ),
    );

    expect(status).toBe(422);
    expect(body.success).toBe(false);
    if (!body.success) {
      expect(Object.keys(body.errors ?? {})).toEqual(
        expect.arrayContaining(["title", "price", "bedrooms"]),
      );
    }
  });

  it("reads a listing and returns a 400 for a malformed id", async () => {
    const landlord = await createUser({ role: "landlord" });
    const property = await createProperty(landlord.id);

    const found = await readResponse(
      await getProperty(
        makeRequest(`/api/properties/${property._id}`),
        params({ id: property._id.toString() }),
      ),
    );
    expect(found.status).toBe(200);

    const malformed = await readResponse(
      await getProperty(
        makeRequest("/api/properties/not-an-id"),
        params({ id: "not-an-id" }),
      ),
    );
    expect(malformed.status).toBe(400);

    const missing = await readResponse(
      await getProperty(
        makeRequest("/api/properties/507f1f77bcf86cd799439011"),
        params({ id: "507f1f77bcf86cd799439011" }),
      ),
    );
    expect(missing.status).toBe(404);
  });

  it("cleans up reviews and favourites when a listing is deleted", async () => {
    const landlord = await createUser({ role: "landlord" });
    const tenant = await createUser({ role: "tenant" });
    const property = await createProperty(landlord.id);

    await User.updateOne(
      { _id: tenant.id },
      { $addToSet: { favorites: property._id } },
    );

    await deletePropertyRoute(
      makeRequest(`/api/properties/${property._id}`, {
        method: "DELETE",
        token: landlord.token,
      }),
      params({ id: property._id.toString() }),
    );

    expect(await Property.countDocuments({ _id: property._id })).toBe(0);
    // The saved-property reference is gone too, not left dangling.
    const after = await User.findById(tenant.id);
    expect(after!.favorites).toHaveLength(0);
  });
});

describe("property search", () => {
  beforeAll(syncIndexes);
  beforeEach(async () => {
    await resetDatabase();

    const landlord = await createUser({ role: "landlord" });
    await createProperty(landlord.id, {
      title: "Accra apartment near the airport",
      city: "Accra",
      price: 1000,
      type: "apartment",
      bedrooms: 2,
      verified: true,
    });
    await createProperty(landlord.id, {
      title: "Kumasi studio close to KNUST",
      city: "Kumasi",
      price: 500,
      type: "studio",
      bedrooms: 1,
    });
    await createProperty(landlord.id, {
      title: "Takoradi house with sea views",
      city: "Takoradi",
      price: 5000,
      type: "house",
      bedrooms: 4,
      verified: true,
    });
  });

  const search = async (query: string) =>
    expectData(
      (
        await readResponse<Paginated<PropertyDTO>>(
          await listProperties(makeRequest(`/api/properties${query}`)),
        )
      ).body,
    );

  it("returns everything with no filters", async () => {
    expect((await search("")).total).toBe(3);
  });

  it("filters by city, case-insensitively", async () => {
    expect((await search("?city=Kumasi")).total).toBe(1);
    expect((await search("?city=kumasi")).total).toBe(1);
    expect((await search("?city=Tamale")).total).toBe(0);
  });

  it("filters by type", async () => {
    expect((await search("?type=studio")).total).toBe(1);
    expect((await search("?type=house")).total).toBe(1);
  });

  it("filters by price range", async () => {
    expect((await search("?minPrice=900")).total).toBe(2);
    expect((await search("?maxPrice=900")).total).toBe(1);
    expect((await search("?minPrice=600&maxPrice=2000")).total).toBe(1);
  });

  it("treats the bedrooms filter as a lower bound", async () => {
    expect((await search("?bedrooms=2")).total).toBe(2);
    expect((await search("?bedrooms=4")).total).toBe(1);
  });

  it("filters by verified status", async () => {
    expect((await search("?verified=true")).total).toBe(2);
  });

  it("searches by keyword across title and location", async () => {
    expect((await search("?q=KNUST")).total).toBe(1);
    expect((await search("?q=sea views")).total).toBe(1);
  });

  it("does not let a regex in the keyword match everything", async () => {
    // Without escaping, ".*" would match every listing.
    expect((await search("?q=.*")).total).toBe(0);
  });

  it("combines filters", async () => {
    expect((await search("?city=Accra&type=apartment&maxPrice=2000")).total).toBe(1);
    expect((await search("?city=Accra&type=house")).total).toBe(0);
  });

  it("sorts by price in both directions", async () => {
    const ascending = await search("?sort=price_asc");
    expect(ascending.items[0]!.price).toBe(500);

    const descending = await search("?sort=price_desc");
    expect(descending.items[0]!.price).toBe(5000);
  });

  it("paginates", async () => {
    const firstPage = await search("?page=1&limit=2");
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.totalPages).toBe(2);

    const secondPage = await search("?page=2&limit=2");
    expect(secondPage.items).toHaveLength(1);
  });

  it("clamps an excessive limit", async () => {
    expect((await search("?limit=100000")).limit).toBeLessThanOrEqual(100);
  });

  it("never leaks the landlord's password or payout details", async () => {
    const results = await search("");
    const serialised = JSON.stringify(results);

    expect(serialised).not.toContain("$2b$");
    expect(serialised).not.toContain("paystackSubaccount");
  });
});

describe("favorites", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  it("saves and removes a property for a tenant", async () => {
    const landlord = await createUser({ role: "landlord" });
    const tenant = await createUser({ role: "tenant" });
    const property = await createProperty(landlord.id);
    const id = property._id.toString();

    const saved = await readResponse(
      await favorite(
        makeRequest(`/api/properties/${id}/favorite`, {
          method: "POST",
          token: tenant.token,
        }),
        params({ id }),
      ),
    );
    expect(saved.status).toBe(200);
    expect((await User.findById(tenant.id))!.favorites).toHaveLength(1);

    const removed = await readResponse(
      await unfavorite(
        makeRequest(`/api/properties/${id}/favorite`, {
          method: "DELETE",
          token: tenant.token,
        }),
        params({ id }),
      ),
    );
    expect(removed.status).toBe(200);
    expect((await User.findById(tenant.id))!.favorites).toHaveLength(0);
  });

  it("is idempotent when saving twice", async () => {
    const landlord = await createUser({ role: "landlord" });
    const tenant = await createUser({ role: "tenant" });
    const property = await createProperty(landlord.id);
    const id = property._id.toString();

    for (let i = 0; i < 3; i += 1) {
      await favorite(
        makeRequest(`/api/properties/${id}/favorite`, {
          method: "POST",
          token: tenant.token,
        }),
        params({ id }),
      );
    }

    expect((await User.findById(tenant.id))!.favorites).toHaveLength(1);
  });

  it("refuses landlords and anonymous visitors", async () => {
    const landlord = await createUser({ role: "landlord" });
    const property = await createProperty(landlord.id);
    const id = property._id.toString();

    const asLandlord = await readResponse(
      await favorite(
        makeRequest(`/api/properties/${id}/favorite`, {
          method: "POST",
          token: landlord.token,
        }),
        params({ id }),
      ),
    );
    expect(asLandlord.status).toBe(403);

    const anonymous = await readResponse(
      await favorite(
        makeRequest(`/api/properties/${id}/favorite`, { method: "POST" }),
        params({ id }),
      ),
    );
    expect(anonymous.status).toBe(401);
  });
});

describe("booking lifecycle", () => {
  beforeAll(syncIndexes);
  beforeEach(resetDatabase);

  async function setup() {
    const landlord = await createUser({ role: "landlord" });
    const tenant = await createUser({ role: "tenant" });
    const property = await createProperty(landlord.id, { price: 1000 });
    return { landlord, tenant, property };
  }

  const futureDate = () =>
    new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

  it("creates a pending booking with a server-computed amount", async () => {
    const { tenant, property } = await setup();

    const { status, body } = await readResponse<{
      booking: { _id: string; status: string; amount: number };
    }>(
      await createBooking(
        makeRequest("/api/bookings", {
          method: "POST",
          token: tenant.token,
          // The client's amount is ignored entirely.
          body: {
            propertyId: property._id.toString(),
            moveInDate: futureDate(),
            amount: 1,
          },
        }),
      ),
    );

    expect(status).toBe(201);
    const booking = expectData(body).booking;
    expect(booking.status).toBe("pending");
    expect(booking.amount).toBe(1000);
  });

  it("rejects a move-in date in the past", async () => {
    const { tenant, property } = await setup();

    const { status } = await readResponse(
      await createBooking(
        makeRequest("/api/bookings", {
          method: "POST",
          token: tenant.token,
          body: {
            propertyId: property._id.toString(),
            moveInDate: "2020-01-01",
          },
        }),
      ),
    );

    expect(status).toBe(422);
  });

  it("stops a landlord booking their own property", async () => {
    const { landlord, property } = await setup();

    const { status } = await readResponse(
      await createBooking(
        makeRequest("/api/bookings", {
          method: "POST",
          token: landlord.token,
          body: {
            propertyId: property._id.toString(),
            moveInDate: futureDate(),
          },
        }),
      ),
    );

    // Landlords cannot use the tenant-only booking endpoint at all.
    expect(status).toBe(403);
  });

  it("prevents the same tenant double-booking a property", async () => {
    const { tenant, property } = await setup();

    const first = await readResponse(
      await createBooking(
        makeRequest("/api/bookings", {
          method: "POST",
          token: tenant.token,
          body: {
            propertyId: property._id.toString(),
            moveInDate: futureDate(),
          },
        }),
      ),
    );
    expect(first.status).toBe(201);

    const second = await readResponse(
      await createBooking(
        makeRequest("/api/bookings", {
          method: "POST",
          token: tenant.token,
          body: {
            propertyId: property._id.toString(),
            moveInDate: futureDate(),
          },
        }),
      ),
    );

    expect(second.status).toBe(409);
    expect(await Booking.countDocuments({ property: property._id })).toBe(1);
  });

  it("confirms a booking, marks the property rented, and releases rivals", async () => {
    const { landlord, tenant, property } = await setup();
    const rival = await createUser({ role: "tenant" });

    const booking = await Booking.create({
      tenant: tenant.id,
      property: property._id,
      landlord: landlord.id,
      status: "pending",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });
    const rivalBooking = await Booking.create({
      tenant: rival.id,
      property: property._id,
      landlord: landlord.id,
      status: "pending",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });

    const { status } = await readResponse(
      await patchBooking(
        makeRequest(`/api/bookings/${booking._id}`, {
          method: "PATCH",
          token: landlord.token,
          body: { status: "confirmed" },
        }),
        params({ id: booking._id.toString() }),
      ),
    );

    expect(status).toBe(200);
    expect((await Property.findById(property._id))!.status).toBe("rented");
    // The other tenant's request is cancelled rather than left hanging.
    expect((await Booking.findById(rivalBooking._id))!.status).toBe("cancelled");
  });

  it("does not let a tenant confirm their own booking", async () => {
    const { landlord, tenant, property } = await setup();

    const booking = await Booking.create({
      tenant: tenant.id,
      property: property._id,
      landlord: landlord.id,
      status: "pending",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });

    const { status } = await readResponse(
      await patchBooking(
        makeRequest(`/api/bookings/${booking._id}`, {
          method: "PATCH",
          token: tenant.token,
          body: { status: "confirmed" },
        }),
        params({ id: booking._id.toString() }),
      ),
    );

    expect(status).toBe(403);
    expect((await Booking.findById(booking._id))!.status).toBe("pending");
  });

  it("lets a tenant cancel their own booking and frees the property", async () => {
    const { landlord, tenant, property } = await setup();

    const booking = await Booking.create({
      tenant: tenant.id,
      property: property._id,
      landlord: landlord.id,
      status: "confirmed",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });
    await Property.updateOne({ _id: property._id }, { $set: { status: "rented" } });

    const { status } = await readResponse(
      await patchBooking(
        makeRequest(`/api/bookings/${booking._id}`, {
          method: "PATCH",
          token: tenant.token,
          body: { status: "cancelled" },
        }),
        params({ id: booking._id.toString() }),
      ),
    );

    expect(status).toBe(200);
    expect((await Property.findById(property._id))!.status).toBe("available");
  });

  it("refuses to change an already-cancelled booking", async () => {
    const { landlord, tenant, property } = await setup();

    const booking = await Booking.create({
      tenant: tenant.id,
      property: property._id,
      landlord: landlord.id,
      status: "cancelled",
      moveInDate: new Date(Date.now() + 86_400_000),
      amount: 1000,
    });

    const { status } = await readResponse(
      await patchBooking(
        makeRequest(`/api/bookings/${booking._id}`, {
          method: "PATCH",
          token: landlord.token,
          body: { status: "confirmed" },
        }),
        params({ id: booking._id.toString() }),
      ),
    );

    expect(status).toBe(409);
  });

  it("rejects booking a property that is already rented", async () => {
    const { tenant, property } = await setup();
    await Property.updateOne({ _id: property._id }, { $set: { status: "rented" } });

    const { status } = await readResponse(
      await createBooking(
        makeRequest("/api/bookings", {
          method: "POST",
          token: tenant.token,
          body: {
            propertyId: property._id.toString(),
            moveInDate: futureDate(),
          },
        }),
      ),
    );

    expect(status).toBe(409);
  });
});
