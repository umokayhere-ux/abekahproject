import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { parsePagination } from "@/lib/validate";
import { requireAdmin } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializeBooking } from "@/lib/serialize";
import { Booking, type BookingDoc } from "@/models/Booking";
import { Payment } from "@/models/Payment";
import { BOOKING_STATUSES, type BookingDTO } from "@/types";

/**
 * GET /api/admin/bookings
 *
 * Platform-wide booking monitor, with each row's payment status attached.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 20 });

  const filter: QueryFilter<BookingDoc> = {};
  const status = params.get("status");
  if (status && BOOKING_STATUSES.includes(status as BookingDoc["status"])) {
    filter.status = status as BookingDoc["status"];
  }

  const [docs, total] = await Promise.all([
    Booking.find(filter)
      .populate("property", "title location price images")
      .populate("tenant", LANDLORD_PUBLIC_FIELDS)
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(filter),
  ]);

  // One extra query for all payment statuses rather than one per booking.
  const payments = await Payment.find({
    booking: { $in: docs.map((doc) => doc._id) },
  })
    .select("booking status")
    .sort({ createdAt: -1 });

  const paymentByBooking = new Map<string, BookingDTO["paymentStatus"]>();
  for (const payment of payments) {
    const key = payment.booking!.toString();
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
