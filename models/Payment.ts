import mongoose, { Schema, type Model, type Types } from "mongoose";
import { PAYMENT_STATUSES, type PaymentStatus } from "@/types";

export interface PaymentDoc {
  _id: Types.ObjectId;
  tenant: Types.ObjectId;
  landlord: Types.ObjectId;
  property: Types.ObjectId;
  booking?: Types.ObjectId;
  /** Amount charged to the tenant, in GHS (major units). */
  amount: number;
  currency: "GHS";
  status: PaymentStatus;
  /** Paystack transaction reference. Unique so webhooks stay idempotent. */
  reference: string;
  splitBreakdown: {
    total: number;
    platform: number;
    landlord: number;
    commissionPercent: number;
    rent: number;
    deposit: number;
  };
  /** Trimmed Paystack payload kept for reconciliation. */
  paystack?: {
    transactionId?: number;
    channel?: string;
    cardType?: string;
    last4?: string;
    paidAt?: Date;
    subaccount?: string;
    fees?: number;
  };
  paidAt?: Date;
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<PaymentDoc>(
  {
    tenant: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    landlord: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    booking: { type: Schema.Types.ObjectId, ref: "Booking", index: true },
    amount: { type: Number, required: true, min: [1, "Amount must be positive"] },
    currency: { type: String, enum: ["GHS"], default: "GHS" },
    status: {
      type: String,
      enum: PAYMENT_STATUSES as unknown as string[],
      default: "pending",
      index: true,
    },
    reference: { type: String, required: true, unique: true },
    splitBreakdown: {
      total: { type: Number, default: 0 },
      platform: { type: Number, default: 0 },
      landlord: { type: Number, default: 0 },
      commissionPercent: { type: Number, default: 0 },
      rent: { type: Number, default: 0 },
      deposit: { type: Number, default: 0 },
    },
    paystack: {
      transactionId: Number,
      channel: String,
      cardType: String,
      last4: String,
      paidAt: Date,
      subaccount: String,
      fees: Number,
    },
    paidAt: Date,
    failureReason: String,
  },
  { timestamps: true },
);

paymentSchema.index({ tenant: 1, createdAt: -1 });
paymentSchema.index({ landlord: 1, status: 1 });
paymentSchema.index({ createdAt: -1 });

export const Payment: Model<PaymentDoc> =
  (mongoose.models.Payment as Model<PaymentDoc>) ||
  mongoose.model<PaymentDoc>("Payment", paymentSchema);

export default Payment;
