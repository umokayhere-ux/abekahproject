import mongoose, { Schema, type Model, type Types } from "mongoose";
import { BOOKING_STATUSES, type BookingStatus } from "@/types";

export interface BookingDoc {
  _id: Types.ObjectId;
  tenant: Types.ObjectId;
  property: Types.ObjectId;
  landlord: Types.ObjectId;
  status: BookingStatus;
  moveInDate: Date;
  /** Server-computed payable amount in GHS, snapshotted at booking time. */
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<BookingDoc>(
  {
    tenant: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: BOOKING_STATUSES as unknown as string[],
      default: "pending",
      index: true,
    },
    moveInDate: { type: Date, required: [true, "Move-in date is required"] },
    amount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// Dashboards list a user's bookings newest-first.
bookingSchema.index({ tenant: 1, createdAt: -1 });
bookingSchema.index({ landlord: 1, createdAt: -1 });
// A tenant cannot hold two live requests on the same property. Partial so that
// cancelled bookings do not block the tenant from trying again later.
bookingSchema.index(
  { tenant: 1, property: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ["pending", "confirmed"] } },
  },
);

export const Booking: Model<BookingDoc> =
  (mongoose.models.Booking as Model<BookingDoc>) ||
  mongoose.model<BookingDoc>("Booking", bookingSchema);

export default Booking;
