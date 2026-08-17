import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { parsePagination } from "@/lib/validate";
import { requireAdmin, toSafeUser } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializeProperty } from "@/lib/serialize";
import { User, type UserDoc } from "@/models/User";
import { Property } from "@/models/Property";

/**
 * Landlords needing a decision: either they have paid and are waiting to be
 * let in (`approvalStatus: "pending"`), or they are in but not yet verified.
 * Rejected and suspended accounts are already decided, so they drop out.
 */
const LANDLORD_QUEUE: QueryFilter<UserDoc> = {
  role: "landlord",
  suspended: false,
  approvalStatus: { $ne: "rejected" },
  $or: [{ approvalStatus: "pending" }, { verified: false }],
};

/**
 * GET /api/admin/verifications
 *
 * The verification queue: landlords awaiting approval, and listings awaiting
 * review. Approving either is done through the existing users/properties
 * PATCH endpoints, so there is one code path per action.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 20 });

  const [landlords, landlordTotal, properties, propertyTotal] = await Promise.all([
    User.find(LANDLORD_QUEUE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(LANDLORD_QUEUE),
    Property.find({ verified: false })
      .populate("landlord", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: -1 })
      .limit(limit),
    Property.countDocuments({ verified: false }),
  ]);

  // How many listings each pending landlord has, so the admin can judge
  // whether an account is worth approving.
  const listingCounts = await Property.aggregate<{ _id: unknown; count: number }>([
    { $match: { landlord: { $in: landlords.map((l) => l._id) } } },
    { $group: { _id: "$landlord", count: { $sum: 1 } } },
  ]);
  const countByLandlord = new Map(
    listingCounts.map((entry) => [String(entry._id), entry.count]),
  );

  return ok({
    landlords: landlords.map((landlord) => ({
      ...toSafeUser(landlord),
      listingCount: countByLandlord.get(landlord._id.toString()) ?? 0,
    })),
    landlordTotal,
    properties: properties.map(serializeProperty),
    propertyTotal,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(landlordTotal / limit)),
  });
});
