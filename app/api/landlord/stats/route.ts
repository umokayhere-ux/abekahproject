import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { requireRole } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializeBooking, serializePayment } from "@/lib/serialize";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Payment } from "@/models/Payment";
import { Conversation } from "@/models/Conversation";
import { Message } from "@/models/Message";

/**
 * GET /api/landlord/stats
 *
 * Landlord overview. Earnings are the landlord's *share* of settled payments,
 * i.e. after the platform commission, so the figure matches what actually
 * settles to their subaccount.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "landlord");
  await connectDB();

  const conversationIds = await Conversation.find({ participants: auth.userId })
    .select("_id")
    .lean();

  const [
    totalListings,
    availableListings,
    verifiedListings,
    totalBookings,
    pendingBookings,
    viewsResult,
    earningsResult,
    recentBookings,
    recentPayments,
    unreadMessages,
  ] = await Promise.all([
    Property.countDocuments({ landlord: auth.userId }),
    Property.countDocuments({ landlord: auth.userId, status: "available" }),
    Property.countDocuments({ landlord: auth.userId, verified: true }),
    Booking.countDocuments({ landlord: auth.userId }),
    Booking.countDocuments({ landlord: auth.userId, status: "pending" }),
    Property.aggregate<{ total: number }>([
      { $match: { landlord: auth.user._id } },
      { $group: { _id: null, total: { $sum: "$views" } } },
    ]),
    Payment.aggregate<{ net: number; gross: number; count: number }>([
      { $match: { landlord: auth.user._id, status: "paid" } },
      {
        $group: {
          _id: null,
          // What settles to the landlord, after commission.
          net: { $sum: "$splitBreakdown.landlord" },
          gross: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]),
    Booking.find({ landlord: auth.userId })
      .populate("property", "title images location price")
      .populate("tenant", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .limit(5),
    Payment.find({ landlord: auth.userId, status: "paid" })
      .populate("property", "title images location price")
      .populate("tenant", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .limit(5),
    Message.countDocuments({
      conversation: { $in: conversationIds.map((c) => c._id) },
      sender: { $ne: auth.user._id },
      read: false,
    }),
  ]);

  return ok({
    totalListings,
    availableListings,
    verifiedListings,
    totalBookings,
    pendingBookings,
    totalViews: viewsResult[0]?.total ?? 0,
    earnings: earningsResult[0]?.net ?? 0,
    grossCollected: earningsResult[0]?.gross ?? 0,
    paymentsReceived: earningsResult[0]?.count ?? 0,
    unreadMessages,
    payoutConfigured: Boolean(auth.safeUser.hasPayoutAccount),
    recentBookings: recentBookings.map((b) => serializeBooking(b)),
    recentPayments: recentPayments.map(serializePayment),
  });
});
