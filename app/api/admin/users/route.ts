import type { QueryFilter } from "mongoose";
import { connectDB } from "@/lib/db";
import { clientIp, fail, notFound, ok, withErrorHandling } from "@/lib/api";
import {
  Validator,
  escapeRegex,
  parsePagination,
  readJson,
} from "@/lib/validate";
import { hashPassword, requireAdmin, toSafeUser } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { User, type UserDoc } from "@/models/User";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Conversation } from "@/models/Conversation";
import { Message } from "@/models/Message";
import { Review } from "@/models/Review";
import { ROLES } from "@/types";

/**
 * GET /api/admin/users?q=&role=&page=&limit=
 *
 * Admin-only user directory with search and role filtering.
 */
export const GET = withErrorHandling(async (request: Request) => {
  await requireAdmin(request);
  await connectDB();

  const params = new URL(request.url).searchParams;
  const { page, limit, skip } = parsePagination(params, { defaultLimit: 20 });

  const filter: QueryFilter<UserDoc> = {};

  const role = params.get("role");
  if (role && ROLES.includes(role as UserDoc["role"])) {
    filter.role = role as UserDoc["role"];
  }

  const q = params.get("q")?.trim();
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }];
  }

  const status = params.get("status");
  if (status === "suspended") filter.suspended = true;
  if (status === "unverified") filter.verified = false;
  // Landlords who have paid and are waiting on an approval decision.
  if (status === "pending") filter.approvalStatus = "pending";

  const [docs, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return ok({
    items: docs.map(toSafeUser),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});


/**
 * POST /api/admin/users
 *
 * Creates an account directly, including another administrator.
 *
 * This is the only way a second admin can come into existence — public
 * registration refuses the role outright, and the environment seed creates
 * exactly one. Reaching here already requires a valid admin JWT, so the
 * privilege boundary is "an admin may appoint an admin", never "a request may
 * claim to be one".
 *
 * Every creation is audit-logged, and elevating to admin is logged under its
 * own action so it is greppable in the activity trail.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireAdmin(request);
  const body = await readJson(request);

  const v = new Validator(body);
  const name = v.string("name", { min: 2, max: 80, label: "Full name" });
  const email = v.email("email");
  const password = v.password("password");
  const phone = v.phone("phone", false);
  // Unlike public sign-up, every role is permitted here.
  const role = v.enum("role", ROLES, { label: "Role" });
  // Admins are created verified; others follow the normal review flow.
  const verified = v.boolean("verified", role === "admin");
  v.assert();

  await connectDB();

  // Checked for a clean message; the unique index is the real guarantee.
  const existing = await User.findOne({ email }).select("_id");
  if (existing) {
    return fail("An account with that email already exists", 409, {
      email: "This email is already registered",
    });
  }

  const created = await User.create({
    name,
    email,
    password: await hashPassword(password),
    role,
    phone,
    verified,
    suspended: false,
    // An admin-created landlord is not charged the listing fee: the platform
    // is onboarding them deliberately rather than taking their money.
    registrationFeePaid: role === "landlord",
    registrationFeePaidAt: role === "landlord" ? new Date() : undefined,
    // An admin creating the account *is* the approval, so it can sign in at once.
    approvalStatus: "approved",
    approvedAt: new Date(),
    approvedBy: auth.user._id,
  });

  await logActivity({
    action:
      role === "admin" ? ACTIONS.ADMIN_CREATED : ACTIONS.USER_CREATED_BY_ADMIN,
    actor: auth.user,
    targetType: "User",
    targetId: created._id.toString(),
    message: `${email} created as ${role} by an administrator`,
    metadata: { role, verified },
    ip: clientIp(request),
  });

  return ok({ user: toSafeUser(created) }, 201);
});

/**
 * PATCH /api/admin/users
 *
 * Verify, unverify, suspend, unsuspend, approve, or reject an account.
 *
 * `approve` and `reject` drive the sign-in gate landlords sit behind after
 * paying their registration fee. An admin cannot suspend themselves, and no
 * action here can grant the admin role — role changes are deliberately not
 * part of this endpoint.
 */
export const PATCH = withErrorHandling(async (request: Request) => {
  const auth = await requireAdmin(request);
  const body = await readJson(request);

  const v = new Validator(body);
  const userId = v.objectId("userId", { label: "User" });
  const action = v.enum(
    "action",
    ["verify", "unverify", "suspend", "unsuspend", "approve", "reject"] as const,
    { label: "Action" },
  );
  // Shown to the applicant, so it is optional but bounded.
  const reason = v.string("reason", {
    required: false,
    max: 500,
    label: "Reason",
  });
  v.assert();

  await connectDB();

  const target = await User.findById(userId);
  if (!target) return notFound("That user could not be found");

  if (userId === auth.userId && (action === "suspend" || action === "unverify")) {
    return fail("You cannot apply that action to your own account", 400);
  }
  if (target.role === "admin" && (action === "suspend" || action === "reject")) {
    return fail("Administrator accounts cannot be suspended", 400);
  }
  if (userId === auth.userId && action === "reject") {
    return fail("You cannot apply that action to your own account", 400);
  }

  const changes: Record<string, unknown> = {};
  switch (action) {
    case "verify":
      changes.verified = true;
      break;
    case "unverify":
      changes.verified = false;
      break;
    case "suspend":
      changes.suspended = true;
      break;
    case "unsuspend":
      changes.suspended = false;
      break;
    case "approve":
      // One press admits the landlord outright: they can sign in *and* they
      // carry the verified badge. Clears any earlier rejection, so the
      // decision is reversible.
      changes.verified = true;
      changes.approvalStatus = "approved";
      changes.approvedAt = new Date();
      changes.approvedBy = auth.user._id;
      changes.rejectionReason = "";
      break;
    case "reject":
      changes.approvalStatus = "rejected";
      changes.rejectionReason = reason || "";
      break;
  }

  const updated = await User.findByIdAndUpdate(
    userId,
    { $set: changes },
    { new: true },
  );

  const actionToLog = {
    verify: ACTIONS.USER_VERIFIED,
    unverify: ACTIONS.USER_UNVERIFIED,
    suspend: ACTIONS.USER_SUSPENDED,
    unsuspend: ACTIONS.USER_UNSUSPENDED,
    approve: ACTIONS.USER_APPROVED,
    reject: ACTIONS.USER_REJECTED,
  }[action!];

  const past = {
    verify: "verified",
    unverify: "unverified",
    suspend: "suspended",
    unsuspend: "unsuspended",
    approve: "approved",
    reject: "rejected",
  }[action!];

  await logActivity({
    action: actionToLog,
    actor: auth.user,
    targetType: "User",
    targetId: userId,
    message: `${target.email} was ${past} by an administrator`,
    metadata: { targetRole: target.role },
    ip: clientIp(request),
  });

  return ok({ user: toSafeUser(updated!) });
});

/**
 * DELETE /api/admin/users?userId=...
 *
 * Removes a user and cleans up what would otherwise dangle: their listings,
 * bookings, reviews, conversations, and any saved-property references to them.
 * Payments are kept as financial records.
 */
export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await requireAdmin(request);

  const url = new URL(request.url);
  // Accept the id from either the query string or a JSON body.
  let userId = url.searchParams.get("userId") ?? "";
  if (!userId) {
    const body = await readJson(request).catch(() => ({}));
    userId = String((body as { userId?: string }).userId ?? "");
  }

  const v = new Validator({ userId });
  const validId = v.objectId("userId", { label: "User" });
  v.assert();

  if (validId === auth.userId) {
    return fail("You cannot delete your own administrator account", 400);
  }

  await connectDB();

  const target = await User.findById(validId);
  if (!target) return notFound("That user could not be found");
  if (target.role === "admin") {
    return fail("Administrator accounts cannot be deleted here", 400);
  }

  const ownedProperties = await Property.find({ landlord: validId }).select("_id");
  const propertyIds = ownedProperties.map((property) => property._id);

  const conversations = await Conversation.find({ participants: validId }).select(
    "_id",
  );

  await Promise.all([
    Property.deleteMany({ landlord: validId }),
    Booking.deleteMany({ $or: [{ tenant: validId }, { landlord: validId }] }),
    Review.deleteMany({ $or: [{ author: validId }, { property: { $in: propertyIds } }] }),
    Message.deleteMany({ conversation: { $in: conversations.map((c) => c._id) } }),
    Conversation.deleteMany({ participants: validId }),
    // Remove the deleted landlord's listings from every tenant's saved list.
    User.updateMany(
      { favorites: { $in: propertyIds } },
      { $pull: { favorites: { $in: propertyIds } } },
    ),
    User.deleteOne({ _id: validId }),
  ]);

  await logActivity({
    action: ACTIONS.USER_DELETED,
    actor: auth.user,
    targetType: "User",
    targetId: validId,
    message: `${target.email} was deleted by an administrator`,
    metadata: { role: target.role, propertiesRemoved: propertyIds.length },
    ip: clientIp(request),
  });

  return ok({
    message: "User deleted",
    propertiesRemoved: propertyIds.length,
  });
});
