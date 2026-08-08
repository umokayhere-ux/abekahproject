import { connectDB } from "@/lib/db";
import { clientIp, notFound, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson, requireObjectId } from "@/lib/validate";
import { assertOwnership, authenticate, optionalAuth } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { LANDLORD_PUBLIC_FIELDS, serializeProperty } from "@/lib/serialize";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Review } from "@/models/Review";
import { PROPERTY_STATUSES, PROPERTY_TYPES } from "@/types";

/** Next 16 delivers route params as a promise. */
type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/properties/[id] — public detail view.
 *
 * The view counter is incremented for anonymous and non-owner traffic only, so
 * a landlord refreshing their own listing does not inflate the number.
 */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "property id");

  await connectDB();
  const property = await Property.findById(id).populate(
    "landlord",
    LANDLORD_PUBLIC_FIELDS,
  );
  if (!property) return notFound("That property could not be found");

  const auth = await optionalAuth(request);
  const isOwner =
    auth && property.landlord && auth.userId === String(
      (property.landlord as unknown as { _id?: unknown })?._id ?? property.landlord,
    );

  if (!isOwner) {
    // Fire-and-forget: a counter failure must not break the page.
    void Property.updateOne({ _id: id }, { $inc: { views: 1 } }).catch(() => undefined);
  }

  return ok({ property: serializeProperty(property) });
});

/**
 * PATCH /api/properties/[id]
 *
 * Ownership is verified against the loaded document, so a landlord cannot edit
 * another landlord's listing by guessing an id. Admins may edit anything.
 * `verified` is not settable here — that is an admin-only action.
 */
export const PATCH = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "property id");

  const auth = await authenticate(request);
  await connectDB();

  const property = await Property.findById(id);
  if (!property) return notFound("That property could not be found");

  assertOwnership(auth, property.landlord, "You can only edit your own listings");

  const body = await readJson(request);
  const v = new Validator(body);
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    updates.title = v.string("title", { min: 5, max: 140, label: "Title" });
  }
  if (body.description !== undefined) {
    updates.description = v.string("description", {
      min: 20,
      max: 5000,
      label: "Description",
    });
  }
  if (body.price !== undefined) {
    updates.price = v.number("price", {
      min: 1,
      max: 10_000_000,
      label: "Monthly rent",
    });
  }
  if (body.type !== undefined) {
    updates.type = v.enum("type", PROPERTY_TYPES, { label: "Property type" });
  }
  if (body.bedrooms !== undefined) {
    updates.bedrooms = v.number("bedrooms", {
      min: 0,
      max: 50,
      integer: true,
      label: "Bedrooms",
    });
  }
  if (body.bathrooms !== undefined) {
    updates.bathrooms = v.number("bathrooms", {
      min: 0,
      max: 50,
      integer: true,
      label: "Bathrooms",
    });
  }
  if (body.status !== undefined) {
    updates.status = v.enum("status", PROPERTY_STATUSES, { label: "Status" });
  }
  if (body.images !== undefined) {
    updates.images = v.urlArray("images", { maxItems: 12 });
  }
  if (body.amenities !== undefined) {
    updates.amenities = v.stringArray("amenities", {
      maxItems: 30,
      maxLength: 60,
    });
  }

  // Location is nested, so each sub-field is set with dot notation to avoid
  // clobbering the parts that were not sent.
  if (body.city !== undefined) {
    updates["location.city"] = v.string("city", { min: 2, max: 80, label: "City" });
  }
  if (body.state !== undefined) {
    updates["location.state"] = v.string("state", {
      min: 2,
      max: 80,
      label: "Region",
    });
  }
  if (body.address !== undefined) {
    updates["location.address"] = v.string("address", {
      min: 5,
      max: 200,
      label: "Address",
    });
  }
  if (body.lat !== undefined && body.lat !== "") {
    updates["location.geo.lat"] = v.number("lat", {
      min: -90,
      max: 90,
      label: "Latitude",
    });
  }
  if (body.lng !== undefined && body.lng !== "") {
    updates["location.geo.lng"] = v.number("lng", {
      min: -180,
      max: 180,
      label: "Longitude",
    });
  }
  v.assert();

  const updated = await Property.findByIdAndUpdate(
    id,
    { $set: updates },
    { new: true, runValidators: true },
  ).populate("landlord", LANDLORD_PUBLIC_FIELDS);

  await logActivity({
    action: ACTIONS.PROPERTY_UPDATED,
    actor: auth.user,
    targetType: "Property",
    targetId: id,
    message: `Listing updated: ${updated?.title ?? id}`,
    metadata: { fields: Object.keys(updates) },
    ip: clientIp(request),
  });

  return ok({ property: serializeProperty(updated!) });
});

/**
 * DELETE /api/properties/[id]
 *
 * Removes the listing along with its reviews and any bookings that never
 * progressed, so no orphaned references remain. Confirmed bookings are kept as
 * a record of what happened, since money may have changed hands.
 */
export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "property id");

  const auth = await authenticate(request);
  await connectDB();

  const property = await Property.findById(id);
  if (!property) return notFound("That property could not be found");

  assertOwnership(auth, property.landlord, "You can only delete your own listings");

  await Promise.all([
    Property.deleteOne({ _id: id }),
    Review.deleteMany({ property: id }),
    Booking.deleteMany({ property: id, status: { $in: ["pending", "cancelled"] } }),
    // Drop the listing from every tenant's saved list.
    (await import("@/models/User")).User.updateMany(
      { favorites: id },
      { $pull: { favorites: id } },
    ),
  ]);

  await logActivity({
    action: ACTIONS.PROPERTY_DELETED,
    actor: auth.user,
    targetType: "Property",
    targetId: id,
    message: `Listing deleted: ${property.title}`,
    ip: clientIp(request),
  });

  return ok({ message: "Listing deleted" });
});
