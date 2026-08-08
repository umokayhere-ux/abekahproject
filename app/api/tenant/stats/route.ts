import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializeBooking, serializePayment } from "@/lib/serialize";
import { Booking } from "@/models/Booking";
import { Payment } from "@/models/Payment";
import { Message } from "@/models/Message";
import { Conversation } from "@/models/Conversation";
import { User } from "@/models/User";

/**
 * GET /api/tenant/stats
 *
 * Everything the tenant overview needs, in one round trip.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "tenant");
  await connectDB();

  const conversationIds = await Conversation.find({ participants: auth.userId })
    .select("_id")
    .lean();

  const [
    currentBooking,
    pendingBookings,
    savedCount,
    recentPayments,
    totalPaidResult,
    unreadMessages,
  ] = await Promise.all([
    Booking.findOne({ tenant: auth.userId, status: "confirmed" })
      .populate("property")
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 }),
    Booking.countDocuments({ tenant: auth.userId, status: "pending" }),
    User.findById(auth.userId)
      .select("favorites")
      .then((user) => user?.favorites.length ?? 0),
    Payment.find({ tenant: auth.userId })
      .populate("property", "title images location price")
      .sort({ createdAt: -1 })
      .limit(5),
    Payment.aggregate<{ total: number }>([
      { $match: { tenant: auth.user._id, status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Message.countDocuments({
      conversation: { $in: conversationIds.map((c) => c._id) },
      sender: { $ne: auth.user._id },
      read: false,
    }),
  ]);

  return ok({
    currentBooking: currentBooking ? serializeBooking(currentBooking) : null,
    pendingBookings,
    savedProperties: savedCount,
    unreadMessages,
    totalPaid: totalPaidResult[0]?.total ?? 0,
    recentPayments: recentPayments.map(serializePayment),
  });
});
