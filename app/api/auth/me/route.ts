import { ok, withErrorHandling } from "@/lib/api";
import { authenticate } from "@/lib/auth";
import { Validator, readJson } from "@/lib/validate";
import { ACTIONS, logActivity } from "@/lib/activity";
import { clientIp } from "@/lib/api";
import { toSafeUser } from "@/lib/auth";
import { User } from "@/models/User";

/**
 * GET /api/auth/me — returns the signed-in user, re-read from the database.
 * Used on load to reconcile the cached `rf_user` with server state.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  return ok({ user: auth.safeUser });
});

/**
 * PATCH /api/auth/me — profile self-service. Deliberately accepts only the
 * fields a user may change; role, verified, and suspended are not editable here.
 */
export const PATCH = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  const body = await readJson(request);
  const v = new Validator(body);

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    updates.name = v.string("name", { min: 2, max: 80, label: "Full name" });
  }
  if (body.phone !== undefined) {
    updates.phone = v.phone("phone", false);
  }
  if (body.bio !== undefined) {
    updates.bio = v.string("bio", { max: 1000, required: false, label: "Bio" });
  }
  if (body.avatar !== undefined) {
    const avatar = v.string("avatar", {
      max: 2000,
      required: false,
      label: "Avatar URL",
    });
    updates.avatar = avatar;
  }
  v.assert();

  const updated = await User.findByIdAndUpdate(auth.userId, { $set: updates }, {
    new: true,
    runValidators: true,
  });

  await logActivity({
    action: ACTIONS.PROFILE_UPDATED,
    actor: auth.user,
    targetType: "User",
    targetId: auth.userId,
    message: "Profile updated",
    metadata: { fields: Object.keys(updates) },
    ip: clientIp(request),
  });

  return ok({ user: toSafeUser(updated ?? auth.user) });
});
