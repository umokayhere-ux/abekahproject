import { connectDB } from "@/lib/db";
import { clientIp, fail, forbidden, notFound, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson, requireObjectId } from "@/lib/validate";
import { authenticate } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { LANDLORD_PUBLIC_FIELDS, serializeBooking } from "@/lib/serialize";
import { Booking } from "@/models/Booking";
import { Property } from "@/models/Property";
import { Payment } from "@/models/Payment";

type Params = { params: Promise<{ id: string }> };

/** True when the caller is the tenant, the landlord, or an admin. */
function canAccess(
  role: string,
  userId: string,
  booking: { tenant: { toString(): string }; landlord: { toString(): string } },
): boolean {
  if (role === "admin") return true;
  return (
    booking.tenant.toString() === userId || booking.landlord.toString() === userId
  );
}

/** GET /api/bookings/[id] — visible only to its participants and admins. */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "booking id");

  const auth = await authenticate(request);
  await connectDB();

  const booking = await Booking.findById(id)
    .populate("property")
    .populate("tenant", LANDLORD_PUBLIC_FIELDS)
    .populate("landlord", LANDLORD_PUBLIC_FIELDS);

  if (!booking) return notFound("That booking could not be found");
  if (!canAccess(auth.role, auth.userId, booking)) {
    return forbidden("You do not have access to this booking");
  }

  const payment = await Payment.findOne({ booking: id }).sort({ createdAt: -1 });

  return ok({
    booking: serializeBooking(booking, {
      paymentStatus: payment?.status ?? "unpaid",
    }),
  });
});

/**
 * PATCH /api/bookings/[id]
 *
 * Landlords confirm or cancel; tenants may only cancel their own request.
 * Confirming marks the property rented and cancels the other outstanding
 * requests, which is what prevents a listing being double-let.
 */
export const PATCH = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "booking id");

  const auth = await authenticate(request);
  const body = await readJson(request);
  const v = new Validator(body);
  const status = v.enum("status", ["confirmed", "cancelled"] as const, {
    label: "Status",
  });
  v.assert();
  // `assert` throws when the enum failed, so a value is guaranteed here.
  const nextStatus = status!;

  await connectDB();

  const booking = await Booking.findById(id);
  if (!booking) return notFound("That booking could not be found");
  if (!canAccess(auth.role, auth.userId, booking)) {
    return forbidden("You do not have access to this booking");
  }

  const isLandlord =
    auth.role === "admin" || booking.landlord.toString() === auth.userId;

  if (nextStatus === "confirmed" && !isLandlord) {
    return forbidden("Only the landlord can confirm a booking");
  }
  if (booking.status === nextStatus) {
    return fail(`This booking is already ${nextStatus}`, 409);
  }
  if (booking.status === "cancelled") {
    return fail("A cancelled booking cannot be changed", 409);
  }

  booking.status = nextStatus;
  await booking.save();

  if (nextStatus === "confirmed") {
    await Property.updateOne(
      { _id: booking.property },
      { $set: { status: "rented" } },
    );
    // Release every other tenant waiting on this listing.
    await Booking.updateMany(
      {
        property: booking.property,
        _id: { $ne: booking._id },
        status: "pending",
      },
      { $set: { status: "cancelled" } },
    );
  } else {
    // Cancelling the confirmed booking puts the listing back on the market.
    const stillConfirmed = await Booking.exists({
      property: booking.property,
      status: "confirmed",
    });
    if (!stillConfirmed) {
      await Property.updateOne(
        { _id: booking.property },
        { $set: { status: "available" } },
      );
    }
  }

  await logActivity({
    action:
      nextStatus === "confirmed"
        ? ACTIONS.BOOKING_CONFIRMED
        : ACTIONS.BOOKING_CANCELLED,
    actor: auth.user,
    targetType: "Booking",
    targetId: id,
    message: `Booking ${nextStatus}`,
    metadata: { propertyId: booking.property.toString() },
    ip: clientIp(request),
  });

  await booking.populate([
    { path: "property" },
    { path: "tenant", select: LANDLORD_PUBLIC_FIELDS },
    { path: "landlord", select: LANDLORD_PUBLIC_FIELDS },
  ]);

  return ok({ booking: serializeBooking(booking) });
});
