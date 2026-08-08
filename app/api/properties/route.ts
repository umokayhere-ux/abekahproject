import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { clientIp, ok, withErrorHandling } from "@/lib/api";
import {
  Validator,
  escapeRegex,
  parsePagination,
  readJson,
} from "@/lib/validate";
import { requireRole } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { LANDLORD_PUBLIC_FIELDS, serializeProperty } from "@/lib/serialize";
import { Property, type PropertyDoc } from "@/models/Property";
import { PROPERTY_STATUSES, PROPERTY_TYPES, type Paginated, type PropertyDTO } from "@/types";

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  bedrooms_desc: { bedrooms: -1 },
};

/**
 * GET /api/properties
 *
 * Public search. Every filter is parsed and bounded here rather than passed
 * through to Mongo, and the keyword is regex-escaped before use.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 12 });

  const filter: QueryFilter<PropertyDoc> = {};

  const city = params.get("city")?.trim();
  if (city) {
    // Anchored, case-insensitive exact-ish match on the city name.
    filter["location.city"] = new RegExp(`^${escapeRegex(city)}$`, "i");
  }

  const type = params.get("type")?.trim();
  if (type && PROPERTY_TYPES.includes(type as (typeof PROPERTY_TYPES)[number])) {
    filter.type = type as PropertyDoc["type"];
  }

  const status = params.get("status")?.trim();
  if (
    status &&
    PROPERTY_STATUSES.includes(status as (typeof PROPERTY_STATUSES)[number])
  ) {
    filter.status = status as PropertyDoc["status"];
  }

  const minPrice = Number(params.get("minPrice"));
  const maxPrice = Number(params.get("maxPrice"));
  const priceRange: Record<string, number> = {};
  if (Number.isFinite(minPrice) && minPrice > 0) priceRange.$gte = minPrice;
  if (Number.isFinite(maxPrice) && maxPrice > 0) priceRange.$lte = maxPrice;
  if (Object.keys(priceRange).length > 0) filter.price = priceRange;

  const bedrooms = Number(params.get("bedrooms"));
  if (Number.isFinite(bedrooms) && bedrooms > 0) {
    // The UI offers "N+ bedrooms", so this is a lower bound.
    filter.bedrooms = { $gte: Math.floor(bedrooms) };
  }

  if (params.get("verified") === "true") filter.verified = true;

  const landlord = params.get("landlord")?.trim();
  if (landlord && /^[a-f\d]{24}$/i.test(landlord)) {
    filter.landlord = landlord;
  }

  const q = params.get("q")?.trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { title: pattern },
      { description: pattern },
      { "location.city": pattern },
      { "location.address": pattern },
    ];
  }

  const sort = SORTS[params.get("sort") ?? "newest"] ?? SORTS.newest!;

  const [docs, total] = await Promise.all([
    Property.find(filter)
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Property.countDocuments(filter),
  ]);

  return ok<Paginated<PropertyDTO>>({
    items: docs.map(serializeProperty),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

/**
 * POST /api/properties
 *
 * Landlords only. The owner is taken from the verified token, never from the
 * request body, so a landlord cannot create a listing under another account.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord", "admin");
  const body = await readJson(request);

  const v = new Validator(body);
  const title = v.string("title", { min: 5, max: 140, label: "Title" });
  const description = v.string("description", {
    min: 20,
    max: 5000,
    label: "Description",
  });
  const price = v.number("price", { min: 1, max: 10_000_000, label: "Monthly rent" });
  const type = v.enum("type", PROPERTY_TYPES, { label: "Property type" });
  const bedrooms = v.number("bedrooms", {
    min: 0,
    max: 50,
    integer: true,
    label: "Bedrooms",
  });
  const bathrooms = v.number("bathrooms", {
    min: 0,
    max: 50,
    integer: true,
    label: "Bathrooms",
  });
  const city = v.string("city", { min: 2, max: 80, label: "City" });
  const state = v.string("state", { min: 2, max: 80, label: "Region" });
  const address = v.string("address", { min: 5, max: 200, label: "Address" });
  const images = v.urlArray("images", { maxItems: 12 });
  const amenities = v.stringArray("amenities", { maxItems: 30, maxLength: 60 });

  const lat = body.lat === undefined || body.lat === "" ? undefined : v.number("lat", { min: -90, max: 90, label: "Latitude" });
  const lng = body.lng === undefined || body.lng === "" ? undefined : v.number("lng", { min: -180, max: 180, label: "Longitude" });
  v.assert();

  await connectDB();

  const property = await Property.create({
    title,
    description,
    price,
    type,
    bedrooms,
    bathrooms,
    location: {
      city,
      state,
      address,
      geo: lat !== undefined && lng !== undefined ? { lat, lng } : undefined,
    },
    images,
    amenities,
    landlord: auth.userId,
    // New listings always start unverified — only an admin can verify them.
    verified: false,
    status: "available",
  });

  await logActivity({
    action: ACTIONS.PROPERTY_CREATED,
    actor: auth.user,
    targetType: "Property",
    targetId: property._id.toString(),
    message: `Listing created: ${title}`,
    metadata: { city, price, type },
    ip: clientIp(request),
  });

  await property.populate("landlord", LANDLORD_PUBLIC_FIELDS);
  return ok({ property: serializeProperty(property) }, 201);
});
