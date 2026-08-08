import mongoose, { Schema, type Model, type Types } from "mongoose";

export interface MessageDoc {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  text: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<MessageDoc>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: {
      type: String,
      required: [true, "Message text is required"],
      trim: true,
      minlength: [1, "Message cannot be empty"],
      maxlength: [4000, "Message is too long"],
    },
    read: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Thread view: messages of a conversation in chronological order.
messageSchema.index({ conversation: 1, createdAt: 1 });
// Unread badge: unread messages in a thread not sent by the current user.
messageSchema.index({ conversation: 1, read: 1, sender: 1 });

export const Message: Model<MessageDoc> =
  (mongoose.models.Message as Model<MessageDoc>) ||
  mongoose.model<MessageDoc>("Message", messageSchema);

export default Message;
