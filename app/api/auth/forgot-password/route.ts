import { createHash, randomBytes } from "node:crypto";
import { connectDB } from "@/lib/db";
import { clientIp, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import { env } from "@/lib/env";
import { sendPasswordResetEmail } from "@/lib/email";
import { ACTIONS, logActivity } from "@/lib/activity";
import { User } from "@/models/User";

/** Reset links are short-lived. */
const TOKEN_TTL_MINUTES = 60;

/**
 * POST /api/auth/forgot-password
 *
 * Always responds 200 with the same message, whether or not the email is
 * registered, so the endpoint cannot be used to discover accounts. Only the
 * SHA-256 of the token is stored — the raw token exists solely in the email.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJson(request);
  const v = new Validator(body);
  const email = v.email("email");
  v.assert();

  const genericResponse = ok({
    message:
      "If an account exists for that email, a password reset link is on its way.",
  });

  await connectDB();
  const user = await User.findOne({ email }).select("_id email suspended");

  // Suspended accounts cannot reset their way back in.
  if (!user || user.suspended) {
    return genericResponse;
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

  await User.updateOne(
    { _id: user._id },
    { $set: { resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt } },
  );

  const resetUrl = `${env.appUrl}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(user.email)}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl, TOKEN_TTL_MINUTES);
  } catch (error) {
    // Never surface a mail failure differently — that would leak existence.
    console.error("[forgot-password] failed to send email:", error);
  }

  await logActivity({
    action: ACTIONS.PASSWORD_RESET_REQUESTED,
    actor: { _id: user._id, email: user.email },
    targetType: "User",
    targetId: user._id.toString(),
    message: "Password reset requested",
    ip: clientIp(request),
  });

  return genericResponse;
});
