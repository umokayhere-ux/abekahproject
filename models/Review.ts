import mongoose, { Schema, type Model, type Types } from "mongoose";

export interface ReviewDoc {
  _id: Types.ObjectId;
  property: Types.ObjectId;
  author: Types.ObjectId;
  rating: number;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<ReviewDoc>(
  {
    property: {
      type: Schema.Types.ObjectId,
      ref: "Property",
      required: true,
      index: true,
    },
    author: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be between 1 and 5"],
      max: [5, "Rating must be between 1 and 5"],
      validate: {
        validator: Number.isInteger,
        message: "Rating must be a whole number",
      },
    },
    comment: {
      type: String,
      required: [true, "Comment is required"],
      trim: true,
      minlength: [5, "Comment must be at least 5 characters"],
      maxlength: [2000, "Comment is too long"],
    },
  },
  { timestamps: true },
);

// One review per property per author.
reviewSchema.index({ property: 1, author: 1 }, { unique: true });
reviewSchema.index({ property: 1, createdAt: -1 });

export const Review: Model<ReviewDoc> =
  (mongoose.models.Review as Model<ReviewDoc>) ||
  mongoose.model<ReviewDoc>("Review", reviewSchema);

export default Review;
