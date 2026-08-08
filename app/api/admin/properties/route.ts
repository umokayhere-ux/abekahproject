import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { clientIp, notFound, ok, withErrorHandling } from "@/lib/api";
import {
  Validator,
  escapeRegex,
  parsePagination,
  readJson,
} from "@/lib/validate";
import { requireAdmin } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { LANDLORD_PUBLIC_FIELDS, serializeProperty } from "@/lib/serialize";
import { Property, type PropertyDoc } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Review } from "@/models/Review";
import { User } from "@/models/User";

/**
 * GET /api/admin/properties?q=&page=&limit=
 *
 * Every listing on the platform, verified or not.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 20 });

  const filter: QueryFilter<PropertyDoc> = {};

  const q = params.get("q")?.trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { title: pattern },
      { "location.city": pattern },
      { "location.address": pattern },
    ];
  }

  const verified = params.get("verified");
  if (verified === "true") filter.verified = true;
  if (verified === "false") filter.verified = false;

  const [docs, total] = await Promise.all([
    Property.find(filter)
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Property.countDocuments(filter),
  ]);

  return ok({
    items: docs.map(serializeProperty),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

/**
 * PATCH /api/admin/properties
 *
 * Verification actions. Verifying a listing is the admin's endorsement that it
 * is genuine, which is why it can only happen here and not through the
 * landlord's own edit endpoint.
 */
export const PATCH = withErrorHandling(async (request: Request) => {
  const auth = await requireAdmin(request);
  const body = await readJson(request);

  const v = new Validator(body);
  const propertyId = v.objectId("propertyId", { label: "Property" });
  const action = v.enum("action", ["verify", "unverify"] as const, {
    label: "Action",
  });
  v.assert();

  await connectDB();

  const property = await Property.findByIdAndUpdate(
    propertyId,
    { $set: { verified: action === "verify" } },
    { new: true },
  ).populate("landlord", LANDLORD_PUBLIC_FIELDS);

  if (!property) return notFound("That property could not be found");

  await logActivity({
    action:
      action === "verify" ? ACTIONS.PROPERTY_VERIFIED : ACTIONS.PROPERTY_UNVERIFIED,
    actor: auth.user,
    targetType: "Property",
    targetId: propertyId,
    message: `${property.title} was ${action === "verify" ? "verified" : "unverified"} by an administrator`,
    ip: clientIp(request),
  });

  return ok({ property: serializeProperty(property) });
});

/**
 * DELETE /api/admin/properties?propertyId=...
 *
 * Removes a listing and everything that points at it.
 */
export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await requireAdmin(request);

  const url = new URL(request.url);
  let propertyId = url.searchParams.get("propertyId") ?? "";
  if (!propertyId) {
    const body = await readJson(request).catch(() => ({}));
    propertyId = String((body as { propertyId?: string }).propertyId ?? "");
  }

  const v = new Validator({ propertyId });
  const validId = v.objectId("propertyId", { label: "Property" });
  v.assert();

  await connectDB();

  const property = await Property.findById(validId);
  if (!property) return notFound("That property could not be found");

  await Promise.all([
    Property.deleteOne({ _id: validId }),
    Review.deleteMany({ property: validId }),
    Booking.deleteMany({ property: validId }),
    User.updateMany({ favorites: validId }, { $pull: { favorites: validId } }),
  ]);

  await logActivity({
    action: ACTIONS.PROPERTY_DELETED,
    actor: auth.user,
    targetType: "Property",
    targetId: validId,
    message: `${property.title} was deleted by an administrator`,
    ip: clientIp(request),
  });

  return ok({ message: "Property deleted" });
});
