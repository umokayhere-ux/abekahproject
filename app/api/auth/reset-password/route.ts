import { createHash } from "node:crypto";
import { connectDB } from "@/lib/db";
import { clientIp, fail, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import { hashPassword } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { User } from "@/models/User";

/**
 * POST /api/auth/reset-password
 *
 * Consumes a single-use token. The token is matched by hash and must be
 * unexpired; on success it is cleared in the same update, so replaying the same
 * link fails.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJson(request);
  const v = new Validator(body);
  const email = v.email("email");
  const token = v.string("token", { min: 32, max: 200, label: "Reset token" });
  const password = v.password("password");
  v.assert();

  await connectDB();

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ email }).select(
    "+resetTokenHash +resetTokenExpiresAt suspended email",
  );

  const invalid = fail(
    "This password reset link is invalid or has expired. Please request a new one.",
    400,
  );

  if (!user || !user.resetTokenHash || !user.resetTokenExpiresAt) return invalid;
  if (user.suspended) return invalid;
  if (user.resetTokenExpiresAt.getTime() < Date.now()) return invalid;
  if (user.resetTokenHash !== tokenHash) return invalid;

  // Setting the new password and clearing the token is one atomic update, so
  // the link cannot be used twice even under concurrent requests.
  const result = await User.updateOne(
    { _id: user._id, resetTokenHash: tokenHash },
    {
      $set: { password: await hashPassword(password) },
      $unset: { resetTokenHash: "", resetTokenExpiresAt: "" },
    },
  );

  if (result.modifiedCount === 0) return invalid;

  await logActivity({
    action: ACTIONS.PASSWORD_RESET_COMPLETED,
    actor: { _id: user._id, email: user.email },
    targetType: "User",
    targetId: user._id.toString(),
    message: "Password reset completed",
    ip: clientIp(request),
  });

  return ok({
    message: "Your password has been updated. You can now sign in.",
  });
});
