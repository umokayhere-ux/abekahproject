import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { clientIp, fail, notFound, ok, withErrorHandling } from "@/lib/api";
import {
  Validator,
  parsePagination,
  readJson,
} from "@/lib/validate";
import { authenticate, requireRole } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { LANDLORD_PUBLIC_FIELDS, serializeBooking } from "@/lib/serialize";
import { computeSplit } from "@/lib/money";
import { Booking, type BookingDoc } from "@/models/Booking";
import { Property } from "@/models/Property";
import { Payment } from "@/models/Payment";
import { BOOKING_STATUSES, type BookingDTO } from "@/types";

/**
 * GET /api/bookings
 *
 * Scoped by role: a tenant sees only their own bookings, a landlord only
 * bookings against their listings, and an admin sees everything. The scope is
 * derived from the token, so no client-supplied id can widen it.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 20 });

  const filter: QueryFilter<BookingDoc> = {};
  if (auth.role === "tenant") filter.tenant = auth.userId;
  else if (auth.role === "landlord") filter.landlord = auth.userId;

  const status = params.get("status");
  if (status && BOOKING_STATUSES.includes(status as BookingDoc["status"])) {
    filter.status = status as BookingDoc["status"];
  }

  const [docs, total] = await Promise.all([
    Booking.find(filter)
      .populate("property")
      .populate("tenant", LANDLORD_PUBLIC_FIELDS)
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(filter),
  ]);

  // Attach each booking's latest payment status in one extra query rather than
  // one per row.
  const payments = await Payment.find({
    booking: { $in: docs.map((doc) => doc._id) },
  })
    .select("booking status createdAt")
    .sort({ createdAt: -1 });

  const paymentByBooking = new Map<string, BookingDTO["paymentStatus"]>();
  for (const payment of payments) {
    const key = payment.booking!.toString();
    // A booking may have several attempts; a successful one wins.
    if (!paymentByBooking.has(key) || payment.status === "paid") {
      paymentByBooking.set(key, payment.status);
    }
  }

  return ok({
    items: docs.map((doc) =>
      serializeBooking(doc, {
        paymentStatus: paymentByBooking.get(doc._id.toString()) ?? "unpaid",
      }),
    ),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

/**
 * POST /api/bookings
 *
 * Tenants only. Availability is checked server-side and the payable amount is
 * computed from the stored property price — the client never supplies it.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "tenant");
  const body = await readJson(request);

  const v = new Validator(body);
  const propertyId = v.objectId("propertyId", { label: "Property" });
  const moveInDate = v.futureDate("moveInDate", { label: "Move-in date" });
  v.assert();

  await connectDB();

  const property = await Property.findById(propertyId);
  if (!property) return notFound("That property could not be found");

  if (property.status === "rented") {
    return fail("This property has already been rented", 409);
  }
  if (property.landlord.toString() === auth.userId) {
    return fail("You cannot book your own property", 400);
  }

  // Another tenant already holds a confirmed booking on this listing.
  const takenByOther = await Booking.exists({
    property: propertyId,
    status: "confirmed",
    tenant: { $ne: auth.userId },
  });
  if (takenByOther) {
    return fail("This property has already been booked by another tenant", 409);
  }

  const split = computeSplit(property.price);

  try {
    const booking = await Booking.create({
      tenant: auth.userId,
      property: property._id,
      landlord: property.landlord,
      status: "pending",
      moveInDate,
      amount: split.total,
    });

    await logActivity({
      action: ACTIONS.BOOKING_CREATED,
      actor: auth.user,
      targetType: "Booking",
      targetId: booking._id.toString(),
      message: `Booking requested for ${property.title}`,
      metadata: { propertyId, amount: split.total },
      ip: clientIp(request),
    });

    await booking.populate([
      { path: "property" },
      { path: "landlord", select: LANDLORD_PUBLIC_FIELDS },
      { path: "tenant", select: LANDLORD_PUBLIC_FIELDS },
    ]);

    return ok({ booking: serializeBooking(booking), split }, 201);
  } catch (error) {
    // The partial unique index rejects a second live booking by the same
    // tenant on the same property.
    if ((error as { code?: number }).code === 11000) {
      return fail("You already have an active booking for this property", 409);
    }
    throw error;
  }
});
