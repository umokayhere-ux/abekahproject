import mongoose, { Schema, type Model, type Types } from "mongoose";
import {
  PROPERTY_STATUSES,
  PROPERTY_TYPES,
  type PropertyStatus,
  type PropertyType,
} from "@/types";

export interface PropertyDoc {
  _id: Types.ObjectId;
  title: string;
  description: string;
  /** Monthly rent in GHS. */
  price: number;
  type: PropertyType;
  bedrooms: number;
  bathrooms: number;
  location: {
    city: string;
    state: string;
    address: string;
    geo?: { lat?: number; lng?: number };
  };
  images: string[];
  amenities: string[];
  landlord: Types.ObjectId;
  verified: boolean;
  status: PropertyStatus;
  views: number;
  ratingAverage: number;
  ratingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const propertySchema = new Schema<PropertyDoc>(
  {
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [5, "Title must be at least 5 characters"],
      maxlength: [140, "Title must be at most 140 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      minlength: [20, "Description must be at least 20 characters"],
      maxlength: [5000, "Description must be at most 5000 characters"],
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [1, "Price must be greater than zero"],
    },
    type: {
      type: String,
      enum: {
        values: PROPERTY_TYPES as unknown as string[],
        message: "Invalid property type",
      },
      required: [true, "Property type is required"],
    },
    bedrooms: {
      type: Number,
      required: true,
      min: [0, "Bedrooms cannot be negative"],
      max: [50, "Bedrooms is unrealistically high"],
    },
    bathrooms: {
      type: Number,
      required: true,
      min: [0, "Bathrooms cannot be negative"],
      max: [50, "Bathrooms is unrealistically high"],
    },
    location: {
      city: { type: String, required: [true, "City is required"], trim: true },
      state: { type: String, required: [true, "Region is required"], trim: true },
      address: { type: String, required: [true, "Address is required"], trim: true },
      geo: {
        lat: { type: Number, min: -90, max: 90 },
        lng: { type: Number, min: -180, max: 180 },
      },
    },
    images: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 12,
        message: "A property may have at most 12 images",
      },
    },
    amenities: { type: [String], default: [] },
    landlord: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    verified: { type: Boolean, default: false },
    status: {
      type: String,
      enum: PROPERTY_STATUSES as unknown as string[],
      default: "available",
    },
    views: { type: Number, default: 0 },
    // Denormalised from Review so listing cards need no extra aggregation.
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// The public search filters on city/type/price/status/verified simultaneously,
// so a compound index covers the common query shape.
propertySchema.index({
  "location.city": 1,
  type: 1,
  status: 1,
  verified: 1,
  price: 1,
});
propertySchema.index({ price: 1 });
propertySchema.index({ bedrooms: 1 });
propertySchema.index({ createdAt: -1 });
// Free-text search over the fields a renter would type into the search bar.
propertySchema.index({
  title: "text",
  description: "text",
  "location.city": "text",
  "location.address": "text",
});

export const Property: Model<PropertyDoc> =
  (mongoose.models.Property as Model<PropertyDoc>) ||
  mongoose.model<PropertyDoc>("Property", propertySchema);

export default Property;
