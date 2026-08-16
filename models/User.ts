import mongoose, { Schema, type Model, type Types } from "mongoose";
import { PAYOUT_CHANNELS, ROLES, type PayoutChannel, type Role } from "@/types";

export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  /** bcrypt hash. `select: false`, so it is absent unless explicitly asked for. */
  password: string;
  role: Role;
  phone?: string;
  avatar?: string;
  bio?: string;
  verified: boolean;
  suspended: boolean;
  favorites: Types.ObjectId[];
  paystackSubaccount?: string;
  /** Bank account or mobile money wallet. Absent until payouts are set up. */
  payoutChannel?: PayoutChannel;
  /** Landlords only: the one-off listing fee has been paid and settled. */
  registrationFeePaid: boolean;
  registrationFeePaidAt?: Date;
  bankName?: string;
  bankCode?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  /** SHA-256 of the emailed reset token — the raw token is never stored. */
  resetTokenHash?: string;
  resetTokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [80, "Name must be at most 80 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Email is not valid"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      // Never ships to a client, and never loaded unless a query opts in.
      select: false,
    },
    role: {
      type: String,
      enum: { values: ROLES as unknown as string[], message: "Invalid role" },
      default: "tenant",
      index: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 1000 },
    verified: { type: Boolean, default: false, index: true },
    suspended: { type: Boolean, default: false, index: true },
    favorites: [{ type: Schema.Types.ObjectId, ref: "Property" }],

    // Payout details (landlords only).
    paystackSubaccount: { type: String, select: false },
    payoutChannel: {
      type: String,
      enum: PAYOUT_CHANNELS as unknown as string[],
    },
    // Only meaningful for landlords; set by the payment webhook, never by a
    // client, so the gate cannot be lifted without money actually arriving.
    registrationFeePaid: { type: Boolean, default: false, index: true },
    registrationFeePaidAt: { type: Date },
    bankName: { type: String, default: "" },
    bankCode: { type: String, select: false },
    bankAccountNumber: { type: String, select: false },
    bankAccountName: { type: String, select: false },

    resetTokenHash: { type: String, select: false },
    resetTokenExpiresAt: { type: Date, select: false },
  },
  { timestamps: true },
);

// Supports the admin user list, which filters by role and sorts by recency.
userSchema.index({ role: 1, createdAt: -1 });
// Backs the admin `?q=` search across name and email.
userSchema.index({ name: "text", email: "text" });

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ||
  mongoose.model<UserDoc>("User", userSchema);

export default User;
