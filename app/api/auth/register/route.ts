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
import { env, registrationFeeGhs } from "@/lib/env";
import {
  generateReference,
  initializeTransaction,
  isPaystackConfigured,
} from "@/lib/paystack";
import { User } from "@/models/User";
import { PendingRegistration } from "@/models/PendingRegistration";
import { PUBLIC_ROLES } from "@/types";

/** How long an unpaid sign-up is held before its email is released. */
const PENDING_TTL_MINUTES = 60;

/**
 * POST /api/auth/register
 *
 * Public sign-up. Only `tenant` and `landlord` can ever be created here — an
 * attempt to pass `role: "admin"` is rejected outright rather than silently
 * downgraded, so the caller learns the boundary exists.
 *
 * The two roles take different paths:
 *
 *   tenant   — free. The account is created immediately and a token returned.
 *   landlord — must pay the listing fee first. No user row is created here;
 *              the details are held in a short-lived pending record and the
 *              account is created by the payment webhook once money settles.
 *
 * A landlord response therefore carries no token and no user: it carries a
 * Paystack authorization URL and access code for the browser to open.
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

  // Checked before any write: a token is issued at the end of the tenant path,
  // and failing there would leave an account the caller was told did not exist.
  assertAuthConfigured();

  await connectDB();
  await ensureAdminSeeded();

  // An email already belonging to a real account is taken, whichever path.
  const existing = await User.findOne({ email }).select("_id");
  if (existing) {
    return fail("An account with that email already exists", 409, {
      email: "This email is already registered",
    });
  }

  if (role === "landlord") {
    return startPaidLandlordSignup({
      request,
      name,
      email,
      password,
      phone,
    });
  }

  // Tenants are free: create immediately.
  const user = await User.create({
    name,
    email,
    password: await hashPassword(password),
    role: "tenant",
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
    message: "tenant account created",
    ip: clientIp(request),
  });

  return ok({ user: toSafeUser(user), token, requiresPayment: false }, 201);
});

/**
 * Holds the landlord's details and opens a Paystack charge for the fee.
 *
 * Nothing is written to `users`. If the payment is abandoned or declined, the
 * pending record simply expires and the email becomes available again.
 */
async function startPaidLandlordSignup({
  request,
  name,
  email,
  password,
  phone,
}: {
  request: Request;
  name: string;
  email: string;
  password: string;
  phone: string;
}) {
  if (!isPaystackConfigured()) {
    // Without Paystack a landlord could never pay, so say so plainly rather
    // than failing further down with something cryptic.
    return fail(
      "Landlord sign-up is temporarily unavailable because payments are not configured. Please try again later.",
      503,
    );
  }

  const amount = registrationFeeGhs();
  const reference = generateReference();

  // Replaces any earlier unpaid attempt for this email, so someone who
  // abandoned a payment can simply start again.
  await PendingRegistration.deleteMany({ email });

  const pending = await PendingRegistration.create({
    name,
    email,
    // Hashed here, exactly as for a real user: the plaintext is never stored.
    password: await hashPassword(password),
    phone,
    reference,
    amount,
    expiresAt: new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000),
  });

  try {
    const transaction = await initializeTransaction({
      email,
      amountCedis: amount,
      reference,
      // No subaccount: the fee settles wholly to the platform account.
      callbackUrl: `${env.appUrl}/auth/registration-complete?reference=${reference}`,
      metadata: {
        purpose: "registration_fee",
        signup: true,
        name,
        email,
      },
    });

    await logActivity({
      action: ACTIONS.PAYMENT_INITIALIZED,
      // No actor: the account does not exist yet.
      targetType: "PendingRegistration",
      targetId: pending._id.toString(),
      message: `Landlord sign-up payment started for ${email}`,
      metadata: { reference, amount, currency: "GHS" },
      ip: clientIp(request),
    });

    return ok(
      {
        requiresPayment: true,
        authorizationUrl: transaction.authorization_url,
        accessCode: transaction.access_code,
        reference,
        amount,
        currency: "GHS",
        email,
      },
      201,
    );
  } catch (error) {
    // Paystack refused; drop the pending record so the email is not held.
    await PendingRegistration.deleteOne({ _id: pending._id });
    throw error;
  }
}
