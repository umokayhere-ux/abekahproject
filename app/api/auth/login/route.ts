import { connectDB } from "@/lib/db";
import { clientIp, fail, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import {
  assertAuthConfigured,
  signToken,
  toSafeUser,
  verifyPassword,
} from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { ensureAdminSeeded } from "@/lib/seed-admin";
import { User } from "@/models/User";

/**
 * POST /api/auth/login
 *
 * The same generic message is returned for an unknown email and a wrong
 * password so the endpoint cannot be used to enumerate accounts.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJson(request);
  const v = new Validator(body);
  const email = v.email("email");
  // Presence check only — an existing weak password must still be able to log in.
  const password = v.string("password", { label: "Password", max: 128 });
  v.assert();

  // Checked first: `ensureAdminSeeded` below writes to the database, and a
  // token is issued at the end. Failing early avoids doing either pointlessly.
  assertAuthConfigured();

  await connectDB();
  // Runs before the lookup so the very first login can be the seeded admin.
  await ensureAdminSeeded();

  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    return fail("Incorrect email or password", 401);
  }

  const passwordMatches = await verifyPassword(password, user.password);
  if (!passwordMatches) {
    return fail("Incorrect email or password", 401);
  }

  // Checked after the password so a suspension is not revealed to a stranger.
  if (user.suspended) {
    return fail(
      "Your account has been suspended. Please contact RentFinder support.",
      403,
    );
  }

  const token = await signToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  await logActivity({
    action: ACTIONS.LOGIN,
    actor: user,
    targetType: "User",
    targetId: user._id.toString(),
    message: `${user.role} signed in`,
    ip: clientIp(request),
  });

  return ok({ user: toSafeUser(user), token });
});
