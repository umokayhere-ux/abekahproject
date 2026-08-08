import { connectDB } from "@/lib/db";
import { notFound, ok, withErrorHandling } from "@/lib/api";
import { requireObjectId } from "@/lib/validate";
import { requireRole, toSafeUser } from "@/lib/auth";
import { Property } from "@/models/Property";
import { User } from "@/models/User";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/properties/[id]/favorite — save a listing.
 *
 * Tenants only. `$addToSet` makes the call idempotent, so a double click
 * cannot produce duplicate entries.
 */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "property id");

  const auth = await requireRole(request, "tenant");
  await connectDB();

  const exists = await Property.exists({ _id: id });
  if (!exists) return notFound("That property could not be found");

  const updated = await User.findByIdAndUpdate(
    auth.userId,
    { $addToSet: { favorites: id } },
    { new: true },
  );

  return ok({
    saved: true,
    user: toSafeUser(updated ?? auth.user),
  });
});

/** DELETE /api/properties/[id]/favorite — remove a saved listing. */
export const DELETE = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "property id");

  const auth = await requireRole(request, "tenant");
  await connectDB();

  const updated = await User.findByIdAndUpdate(
    auth.userId,
    { $pull: { favorites: id } },
    { new: true },
  );

  return ok({
    saved: false,
    user: toSafeUser(updated ?? auth.user),
  });
});
