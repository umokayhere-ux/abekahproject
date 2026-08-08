import mongoose, { Schema, type Model, type Types } from "mongoose";
import { ROLES, type Role } from "@/types";

/**
 * Append-only audit trail.
 *
 * Only non-sensitive descriptive data is written here — never passwords, JWTs,
 * reset tokens, or Paystack keys. See `lib/activity.ts` for the write helper.
 */
export interface ActivityDoc {
  _id: Types.ObjectId;
  action: string;
  actor?: Types.ObjectId;
  actorEmail?: string;
  actorRole?: Role;
  targetType?: string;
  targetId?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
  updatedAt: Date;
}

const activitySchema = new Schema<ActivityDoc>(
  {
    action: { type: String, required: true, index: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorEmail: String,
    actorRole: { type: String, enum: ROLES as unknown as string[] },
    targetType: String,
    targetId: String,
    message: String,
    metadata: { type: Schema.Types.Mixed },
    ip: String,
  },
  { timestamps: true },
);

activitySchema.index({ createdAt: -1 });
activitySchema.index({ action: 1, createdAt: -1 });

export const Activity: Model<ActivityDoc> =
  (mongoose.models.Activity as Model<ActivityDoc>) ||
  mongoose.model<ActivityDoc>("Activity", activitySchema);

export default Activity;
