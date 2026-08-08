import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { requireAdmin, toSafeUser } from "@/lib/auth";
import { serializePayment, serializeProperty, LANDLORD_PUBLIC_FIELDS } from "@/lib/serialize";
import { User } from "@/models/User";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Payment } from "@/models/Payment";

/**
 * GET /api/admin/stats
 *
 * Platform-wide figures for the admin overview, all from real counts.
 * Requires a valid JWT *and* the admin role.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin(request);
  await connectDB();

  const [
    totalUsers,
    tenants,
    landlords,
    admins,
    suspendedUsers,
    totalProperties,
    verifiedProperties,
    pendingLandlordVerifications,
    totalBookings,
    confirmedBookings,
    pendingBookings,
    totalPayments,
    revenue,
    recentUsers,
    recentProperties,
    recentPayments,
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ role: "tenant" }),
    User.countDocuments({ role: "landlord" }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ suspended: true }),
    Property.countDocuments({}),
    Property.countDocuments({ verified: true }),
    User.countDocuments({ role: "landlord", verified: false, suspended: false }),
    Booking.countDocuments({}),
    Booking.countDocuments({ status: "confirmed" }),
    Booking.countDocuments({ status: "pending" }),
    Payment.countDocuments({}),
    Payment.aggregate<{
      gross: number;
      commission: number;
      landlordShare: number;
      count: number;
    }>([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          gross: { $sum: "$amount" },
          commission: { $sum: "$splitBreakdown.platform" },
          landlordShare: { $sum: "$splitBreakdown.landlord" },
          count: { $sum: 1 },
        },
      },
    ]),
    User.find({}).sort({ createdAt: -1 }).limit(5),
    Property.find({})
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .limit(5),
    Payment.find({})
      .populate("property", "title location price")
      .populate("tenant", LANDLORD_PUBLIC_FIELDS)
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .limit(5),
  ]);

  return ok({
    users: {
      total: totalUsers,
      tenants,
      landlords,
      admins,
      suspended: suspendedUsers,
    },
    properties: {
      total: totalProperties,
      verified: verifiedProperties,
      pendingVerification: totalProperties - verifiedProperties,
    },
    verifications: { pendingLandlords: pendingLandlordVerifications },
    bookings: {
      total: totalBookings,
      confirmed: confirmedBookings,
      pending: pendingBookings,
    },
    payments: {
      total: totalPayments,
      settled: revenue[0]?.count ?? 0,
      grossVolume: revenue[0]?.gross ?? 0,
      platformCommission: revenue[0]?.commission ?? 0,
      landlordPayouts: revenue[0]?.landlordShare ?? 0,
    },
    recentUsers: recentUsers.map(toSafeUser),
    recentProperties: recentProperties.map(serializeProperty),
    recentPayments: recentPayments.map(serializePayment),
  });
});
