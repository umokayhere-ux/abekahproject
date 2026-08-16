import mongoose, { Schema, type Model, type Types } from "mongoose";

/**
 * A landlord sign-up that has been paid for but not yet completed.
 *
 * Landlords must pay the listing fee *before* an account exists, so the
 * submitted details have to live somewhere between "clicked create" and
 * "payment settled". They are held here — never in `users` — so an abandoned
 * or failed payment leaves no account behind.
 *
 * The password is already bcrypt-hashed when it arrives; the plaintext is
 * never stored, exactly as for a real user. The record is deleted the moment
 * the account is created, and expires on its own if payment never completes.
 */
export interface PendingRegistrationDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  /** bcrypt hash, computed before this record is written. */
  password: string;
  phone?: string;
  /** Paystack reference for the fee payment that will complete this sign-up. */
  reference: string;
  amount: number;
  /** TTL anchor: Mongo removes the document once this passes. */
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pendingRegistrationSchema = new Schema<PendingRegistrationDoc>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Never selected by default: nothing should read it except the completion
    // path that copies it onto the new user.
    password: { type: String, required: true, select: false },
    phone: { type: String, default: "" },
    reference: { type: String, required: true, unique: true },
    amount: { type: Number, required: true, min: 1 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

/*
 * Mongo deletes the document when `expiresAt` passes, so an abandoned sign-up
 * cleans itself up and, importantly, releases the email address for someone
 * else to use.
 */
pendingRegistrationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingRegistration: Model<PendingRegistrationDoc> =
  (mongoose.models.PendingRegistration as Model<PendingRegistrationDoc>) ||
  mongoose.model<PendingRegistrationDoc>(
    "PendingRegistration",
    pendingRegistrationSchema,
  );

export default PendingRegistration;
