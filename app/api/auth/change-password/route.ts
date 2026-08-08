import { clientIp, fail, ok, withErrorHandling } from "@/lib/api";
import { authenticate, hashPassword, verifyPassword } from "@/lib/auth";
import { Validator, readJson } from "@/lib/validate";
import { ACTIONS, logActivity } from "@/lib/activity";
import { User } from "@/models/User";

/**
 * POST /api/auth/change-password
 *
 * Requires the current password, so a stolen token alone cannot lock the owner
 * out of their account.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  const body = await readJson(request);
  const v = new Validator(body);
  const currentPassword = v.string("currentPassword", {
    label: "Current password",
    max: 128,
  });
  const newPassword = v.password("newPassword");
  v.assert();

  const user = await User.findById(auth.userId).select("+password");
  if (!user) return fail("Your account no longer exists", 401);

  const matches = await verifyPassword(currentPassword, user.password);
  if (!matches) {
    return fail("Your current password is incorrect", 400, {
      currentPassword: "Incorrect password",
    });
  }

  if (currentPassword === newPassword) {
    return fail("Your new password must be different", 400, {
      newPassword: "Choose a password you have not used here before",
    });
  }

  user.password = await hashPassword(newPassword);
  // Any outstanding reset link is invalidated by a deliberate password change.
  user.resetTokenHash = undefined;
  user.resetTokenExpiresAt = undefined;
  await user.save();

  await logActivity({
    action: ACTIONS.PASSWORD_CHANGED,
    actor: auth.user,
    targetType: "User",
    targetId: auth.userId,
    message: "Password changed",
    ip: clientIp(request),
  });

  return ok({ message: "Your password has been changed" });
});
