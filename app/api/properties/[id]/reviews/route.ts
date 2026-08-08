import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { clientIp, fail, notFound, ok, withErrorHandling } from "@/lib/api";
import { Validator, parsePagination, readJson, requireObjectId } from "@/lib/validate";
import { requireRole } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { LANDLORD_PUBLIC_FIELDS, serializeReview } from "@/lib/serialize";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Review } from "@/models/Review";

type Params = { params: Promise<{ id: string }> };

/** Recomputes the denormalised rating summary held on the property. */
async function refreshRating(propertyId: string): Promise<void> {
  const [summary] = await Review.aggregate<{ average: number; count: number }>([
    { $match: { property: Types.ObjectId.createFromHexString(propertyId) } },
    {
      $group: {
        _id: null,
        average: { $avg: "$rating" },
        count: { $sum: 1 },
      },
    },
  ]);

  await Property.updateOne(
    { _id: propertyId },
    {
      $set: {
        ratingAverage: summary ? Math.round(summary.average * 10) / 10 : 0,
        ratingCount: summary?.count ?? 0,
      },
    },
  );
}

/** GET /api/properties/[id]/reviews — public list, newest first. */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "property id");

  await connectDB();
  const { page, limit, skip } = parsePagination(
    new URL(request.url).searchParams,
    { defaultLimit: 10 },
  );

  const [docs, total] = await Promise.all([
    Review.find({ property: id })
      .populate("author", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Review.countDocuments({ property: id }),
  ]);

  return ok({
    items: docs.map(serializeReview),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

/**
 * POST /api/properties/[id]/reviews
 *
 * Only a tenant with a confirmed booking on this property may review it, so
 * reviews reflect real tenancies. The unique index enforces one per tenant.
 */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "property id");

  const auth = await requireRole(request, "tenant");
  await connectDB();

  const property = await Property.findById(id).select("_id title");
  if (!property) return notFound("That property could not be found");

  const hasStayed = await Booking.exists({
    property: id,
    tenant: auth.userId,
    status: "confirmed",
  });
  if (!hasStayed) {
    return fail(
      "You can only review a property after your booking has been confirmed",
      403,
    );
  }

  const existing = await Review.exists({ property: id, author: auth.userId });
  if (existing) {
    return fail("You have already reviewed this property", 409);
  }

  const body = await readJson(request);
  const v = new Validator(body);
  const rating = v.number("rating", {
    min: 1,
    max: 5,
    integer: true,
    label: "Rating",
  });
  const comment = v.string("comment", { min: 5, max: 2000, label: "Comment" });
  v.assert();

  const review = await Review.create({
    property: id,
    author: auth.userId,
    rating,
    comment,
  });

  await refreshRating(id);

  await logActivity({
    action: ACTIONS.REVIEW_CREATED,
    actor: auth.user,
    targetType: "Property",
    targetId: id,
    message: `Review left for ${property.title}`,
    metadata: { rating },
    ip: clientIp(request),
  });

  await review.populate("author", LANDLORD_PUBLIC_FIELDS);
  return ok({ review: serializeReview(review) }, 201);
});
