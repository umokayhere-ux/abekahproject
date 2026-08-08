import { connectDB } from "@/lib/db";
import { ok, withErrorHandling } from "@/lib/api";
import { Property } from "@/models/Property";
import { User } from "@/models/User";
import { Booking } from "@/models/Booking";

/**
 * GET /api/stats
 *
 * Public counters for the landing page. These are real database counts, not
 * placeholders, and are cached briefly so the homepage does not run four
 * counts on every visit.
 */
export const revalidate = 300;

export const GET = withErrorHandling(async () => {
  await connectDB();

  const [availableProperties, landlords, tenants, confirmedRentals] =
    await Promise.all([
      Property.countDocuments({ status: "available" }),
      User.countDocuments({ role: "landlord", suspended: false }),
      User.countDocuments({ role: "tenant", suspended: false }),
      Booking.countDocuments({ status: "confirmed" }),
    ]);

  return ok({
    availableProperties,
    landlords,
    tenants,
    confirmedRentals,
  });
});
