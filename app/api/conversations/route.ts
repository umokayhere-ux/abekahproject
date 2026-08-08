import { connectDB } from "@/lib/db";
import { fail, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import { authenticate, toSafeUser } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS } from "@/lib/serialize";
import { Conversation } from "@/models/Conversation";
import { Message } from "@/models/Message";
import { User, type UserDoc } from "@/models/User";
import { Property } from "@/models/Property";
import type { ConversationDTO } from "@/types";

/**
 * GET /api/conversations
 *
 * The caller's inbox. The filter is `participants: userId`, so a user can only
 * ever receive threads they belong to.
 */
export const GET = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  await connectDB();

  const conversations = await Conversation.find({ participants: auth.userId })
    .populate("participants", LANDLORD_PUBLIC_FIELDS)
    .populate("property", "title images location price")
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(100);

  // Unread counts for all threads in a single grouped query.
  const unread = await Message.aggregate<{ _id: unknown; count: number }>([
    {
      $match: {
        conversation: { $in: conversations.map((c) => c._id) },
        read: false,
        sender: { $ne: auth.user._id },
      },
    },
    { $group: { _id: "$conversation", count: { $sum: 1 } } },
  ]);

  const unreadByConversation = new Map(
    unread.map((entry) => [String(entry._id), entry.count]),
  );

  const items: ConversationDTO[] = conversations.map((conversation) => ({
    _id: conversation._id.toString(),
    participants: (conversation.participants as unknown as UserDoc[]).map(
      toSafeUser,
    ),
    property: conversation.property
      ? String(
          (conversation.property as unknown as { _id?: unknown })._id ??
            conversation.property,
        )
      : undefined,
    lastMessage: conversation.lastMessage,
    lastMessageAt: conversation.lastMessageAt?.toISOString(),
    unreadCount: unreadByConversation.get(conversation._id.toString()) ?? 0,
    createdAt: conversation.createdAt?.toISOString(),
    updatedAt: conversation.updatedAt?.toISOString(),
  }));

  return ok({ items });
});

/**
 * POST /api/conversations
 *
 * Starts (or reopens) a thread with another user. Deliberately idempotent: a
 * tenant messaging the same landlord twice lands in the existing thread rather
 * than creating duplicates.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await authenticate(request);
  const body = await readJson(request);

  const v = new Validator(body);
  const recipientId = v.objectId("recipientId", { label: "Recipient" });
  const propertyId = body.propertyId
    ? v.objectId("propertyId", { label: "Property" })
    : undefined;
  const text = body.message
    ? v.string("message", { min: 1, max: 4000, label: "Message" })
    : "";
  v.assert();

  if (recipientId === auth.userId) {
    return fail("You cannot start a conversation with yourself", 400);
  }

  await connectDB();

  const recipient = await User.findById(recipientId).select("_id suspended");
  if (!recipient || recipient.suspended) {
    return fail("That user is not available to receive messages", 404);
  }

  if (propertyId) {
    const propertyExists = await Property.exists({ _id: propertyId });
    if (!propertyExists) return fail("That property could not be found", 404);
  }

  // Match on both participants regardless of the order they were stored in.
  let conversation = await Conversation.findOne({
    participants: { $all: [auth.userId, recipientId], $size: 2 },
  });

  if (!conversation) {
    conversation = await Conversation.create({
      participants: [auth.userId, recipientId],
      property: propertyId,
      lastMessage: "",
    });
  }

  if (text) {
    await Message.create({
      conversation: conversation._id,
      sender: auth.userId,
      text,
      read: false,
    });
    conversation.lastMessage = text.slice(0, 200);
    conversation.lastMessageAt = new Date();
    await conversation.save();
  }

  await conversation.populate("participants", LANDLORD_PUBLIC_FIELDS);

  return ok(
    {
      conversation: {
        _id: conversation._id.toString(),
        participants: (conversation.participants as unknown as UserDoc[]).map(
          toSafeUser,
        ),
        lastMessage: conversation.lastMessage,
        lastMessageAt: conversation.lastMessageAt?.toISOString(),
        unreadCount: 0,
      } satisfies ConversationDTO,
    },
    201,
  );
});
