import mongoose, { Schema, type Model, type Types } from "mongoose";

export interface ConversationDoc {
  _id: Types.ObjectId;
  /** Exactly the users allowed to read this thread. */
  participants: Types.ObjectId[];
  /** Optional context: the listing the conversation started from. */
  property?: Types.ObjectId;
  lastMessage: string;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<ConversationDoc>(
  {
    participants: {
      type: [{ type: Schema.Types.ObjectId, ref: "User", required: true }],
      validate: {
        validator: (v: Types.ObjectId[]) => v.length >= 2,
        message: "A conversation needs at least two participants",
      },
      index: true,
    },
    property: { type: Schema.Types.ObjectId, ref: "Property" },
    lastMessage: { type: String, default: "" },
    lastMessageAt: { type: Date },
  },
  { timestamps: true },
);

// Inbox query: "threads I am in, most recently active first".
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

export const Conversation: Model<ConversationDoc> =
  (mongoose.models.Conversation as Model<ConversationDoc>) ||
  mongoose.model<ConversationDoc>("Conversation", conversationSchema);

export default Conversation;
