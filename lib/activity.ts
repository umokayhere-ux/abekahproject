import { Activity } from "@/models/Activity";
import { connectDB } from "./db";
import type { Role } from "@/types";

/** Canonical action names, so the audit log stays queryable. */
export const ACTIONS = {
  LOGIN: "auth.login",
  LOGOUT: "auth.logout",
  REGISTER: "user.created",
  PASSWORD_RESET_REQUESTED: "auth.password_reset_requested",
  PASSWORD_RESET_COMPLETED: "auth.password_reset_completed",
  PASSWORD_CHANGED: "auth.password_changed",
  PROFILE_UPDATED: "user.profile_updated",
  USER_SUSPENDED: "user.suspended",
  USER_UNSUSPENDED: "user.unsuspended",
  USER_VERIFIED: "user.verified",
  USER_UNVERIFIED: "user.unverified",
  USER_DELETED: "user.deleted",
  USER_CREATED_BY_ADMIN: "user.created_by_admin",
  ADMIN_CREATED: "admin.created",
  PROPERTY_CREATED: "property.created",
  PROPERTY_UPDATED: "property.updated",
  PROPERTY_DELETED: "property.deleted",
  PROPERTY_VERIFIED: "property.verified",
  PROPERTY_UNVERIFIED: "property.unverified",
  BOOKING_CREATED: "booking.created",
  BOOKING_CONFIRMED: "booking.confirmed",
  BOOKING_CANCELLED: "booking.cancelled",
  PAYMENT_INITIALIZED: "payment.initialized",
  PAYMENT_COMPLETED: "payment.completed",
  PAYMENT_FAILED: "payment.failed",
  PAYOUT_CONFIGURED: "landlord.payout_configured",
  REVIEW_CREATED: "review.created",
  ADMIN_RESET: "admin.reset",
} as const;

export type ActionName = (typeof ACTIONS)[keyof typeof ACTIONS];

/**
 * Keys that must never reach the audit log. Metadata is filtered through this
 * list defensively so a future caller cannot accidentally persist a secret.
 *
 * Entries must be written in normalised form — lowercase, with `-` and `_`
 * removed — because that is how incoming keys are compared. Writing
 * "rf_token" here rather than "rftoken" would silently never match.
 */
const FORBIDDEN_METADATA_KEYS = [
  "password",
  "newpassword",
  "currentpassword",
  "confirmpassword",
  "token",
  "jwt",
  "rftoken",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "secret",
  "secretkey",
  "paystacksecretkey",
  "apikey",
  "apisecret",
  "resettoken",
  "resettokenhash",
  "bankaccountnumber",
  "accountnumber",
];

function sanitizeMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.includes(key.toLowerCase().replace(/[-_]/g, ""))) {
      continue;
    }
    clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}

export interface LogInput {
  action: ActionName | string;
  /**
   * The acting user. Typed loosely because callers pass either a full document
   * or just an id; the value is handed straight to Mongoose, which casts it.
   */
  actor?: { _id: unknown; email?: string; role?: Role } | null;
  targetType?: string;
  targetId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/**
 * Writes an audit entry. Deliberately never throws — an audit failure must not
 * break the user-facing action that triggered it.
 */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    await connectDB();
    await Activity.create({
      action: input.action,
      actor: input.actor?._id as never,
      actorEmail: input.actor?.email,
      actorRole: input.actor?.role,
      targetType: input.targetType,
      targetId: input.targetId,
      message: input.message,
      metadata: sanitizeMetadata(input.metadata),
      ip: input.ip,
    });
  } catch (error) {
    console.error("[activity] failed to write audit entry:", error);
  }
}
