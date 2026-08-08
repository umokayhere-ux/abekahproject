import { connectDB } from "@/lib/db";
import { clientIp, fail, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import {
  assertAuthConfigured,
  hashPassword,
  signToken,
  toSafeUser,
} from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { ensureAdminSeeded } from "@/lib/seed-admin";
import { User } from "@/models/User";
import { PUBLIC_ROLES } from "@/types";

/**
 * POST /api/auth/register
 *
 * Public sign-up. Only `tenant` and `landlord` can ever be created here — an
 * attempt to pass `role: "admin"` is rejected outright rather than silently
 * downgraded, so the caller learns the boundary exists.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJson(request);

  // Reject privilege escalation before any other work.
  if (typeof body.role === "string" && body.role === "admin") {
    return fail("Administrator accounts cannot be created through sign-up", 403);
  }

  const v = new Validator(body);
  const name = v.string("name", { min: 2, max: 80, label: "Full name" });
  const email = v.email("email");
  const password = v.password("password");
  const phone = v.phone("phone", false);
  const role = v.enum("role", PUBLIC_ROLES, { required: false }) ?? "tenant";
  v.assert();

  // Checked before any write: a token is issued at the end of this handler, and
  // failing there would leave an account created but the caller told sign-up
  // failed — who would then be blocked by "email already exists" on retry.
  assertAuthConfigured();

  await connectDB();
  await ensureAdminSeeded();

  // Check first for a clean message; the unique index is the real guarantee.
  const existing = await User.findOne({ email }).select("_id");
  if (existing) {
    return fail("An account with that email already exists", 409, {
      email: "This email is already registered",
    });
  }

  const user = await User.create({
    name,
    email,
    password: await hashPassword(password),
    role,
    phone,
    verified: false,
    suspended: false,
  });

  const token = await signToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });

  await logActivity({
    action: ACTIONS.REGISTER,
    actor: user,
    targetType: "User",
    targetId: user._id.toString(),
    message: `${role} account created`,
    ip: clientIp(request),
  });

  return ok({ user: toSafeUser(user), token }, 201);
});
