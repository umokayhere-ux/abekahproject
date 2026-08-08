import { connectDB } from "@/lib/db";
import { forbidden, notFound, ok, withErrorHandling } from "@/lib/api";
import { Validator, parsePagination, readJson, requireObjectId } from "@/lib/validate";
import { authenticate } from "@/lib/auth";
import { LANDLORD_PUBLIC_FIELDS, serializeMessage } from "@/lib/serialize";
import { Conversation } from "@/models/Conversation";
import { Message } from "@/models/Message";

type Params = { params: Promise<{ id: string }> };

/**
 * Loads the thread and refuses anyone who is not a participant.
 * Admins are not granted a bypass here — private correspondence stays private.
 */
async function loadThread(conversationId: string, userId: string) {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return { error: notFound("Conversation not found") };

  const isParticipant = conversation.participants.some(
    (participant) => participant.toString() === userId,
  );
  if (!isParticipant) {
    return { error: forbidden("You are not part of this conversation") };
  }

  return { conversation };
}

/**
 * GET /api/conversations/[id]/messages
 *
 * Returns the thread and marks the other party's messages as read, which is
 * what clears the unread badge.
 */
export const GET = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "conversation id");

  const auth = await authenticate(request);
  await connectDB();

  const { error } = await loadThread(id, auth.userId);
  if (error) return error;

  const { page, limit, skip } = parsePagination(
    new URL(request.url).searchParams,
    { defaultLimit: 50, maxLimit: 200 },
  );

  const [docs, total] = await Promise.all([
    Message.find({ conversation: id })
      .populate("sender", LANDLORD_PUBLIC_FIELDS)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit),
    Message.countDocuments({ conversation: id }),
  ]);

  await Message.updateMany(
    { conversation: id, sender: { $ne: auth.user._id }, read: false },
    { $set: { read: true } },
  );

  return ok({
    items: docs.map(serializeMessage),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

/**
 * POST /api/conversations/[id]/messages
 *
 * The sender is taken from the token, so a message cannot be attributed to
 * someone else.
 */
export const POST = withErrorHandling(async (request: Request, { params }: Params) => {
  const { id } = await params;
  requireObjectId(id, "conversation id");

  const auth = await authenticate(request);
  await connectDB();

  const { conversation, error } = await loadThread(id, auth.userId);
  if (error) return error;

  const body = await readJson(request);
  const v = new Validator(body);
  const text = v.string("text", { min: 1, max: 4000, label: "Message" });
  v.assert();

  const message = await Message.create({
    conversation: id,
    sender: auth.userId,
    text,
    read: false,
  });

  // Keep the inbox preview and ordering in step with the thread.
  conversation!.lastMessage = text.slice(0, 200);
  conversation!.lastMessageAt = new Date();
  await conversation!.save();

  await message.populate("sender", LANDLORD_PUBLIC_FIELDS);
  return ok({ message: serializeMessage(message) }, 201);
});
