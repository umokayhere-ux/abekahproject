import { toSafeUser } from "./auth";
import type { UserDoc } from "@/models/User";
import type { PropertyDoc } from "@/models/Property";
import type { BookingDoc } from "@/models/Booking";
import type { PaymentDoc } from "@/models/Payment";
import type { MessageDoc } from "@/models/Message";
import type { ReviewDoc } from "@/models/Review";
import type { ActivityDoc } from "@/models/Activity";
import type {
  ActivityDTO,
  BookingDTO,
  MessageDTO,
  PaymentDTO,
  PropertyDTO,
  ReviewDTO,
} from "@/types";

/**
 * Converts Mongoose documents into the wire shapes in `types/`.
 *
 * Every reference field may arrive either populated or as a bare ObjectId, so
 * each helper handles both. Users always pass through `toSafeUser`, which is
 * what keeps password hashes and payout details off the wire.
 */

type MaybePopulated<T> = T | { _id: unknown } | unknown;

function isPopulatedUser(value: unknown): value is UserDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    "email" in value &&
    "role" in value
  );
}

function isPopulatedProperty(value: unknown): value is PropertyDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    "price" in value
  );
}

/** Renders a reference as either a populated DTO or its id string. */
function refToUser(value: MaybePopulated<UserDoc>) {
  return isPopulatedUser(value)
    ? toSafeUser(value)
    : String((value as { _id?: unknown })?._id ?? value);
}

export function serializeProperty(doc: PropertyDoc): PropertyDTO {
  return {
    _id: doc._id.toString(),
    title: doc.title,
    description: doc.description,
    price: doc.price,
    type: doc.type,
    bedrooms: doc.bedrooms,
    bathrooms: doc.bathrooms,
    location: {
      city: doc.location.city,
      state: doc.location.state,
      address: doc.location.address,
      geo: doc.location.geo?.lat
        ? { lat: doc.location.geo.lat, lng: doc.location.geo.lng }
        : undefined,
    },
    images: doc.images ?? [],
    amenities: doc.amenities ?? [],
    landlord: refToUser(doc.landlord),
    verified: doc.verified,
    status: doc.status,
    views: doc.views ?? 0,
    ratingAverage: doc.ratingAverage ?? 0,
    ratingCount: doc.ratingCount ?? 0,
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export function serializeBooking(
  doc: BookingDoc,
  extras: { paymentStatus?: BookingDTO["paymentStatus"] } = {},
): BookingDTO {
  return {
    _id: doc._id.toString(),
    tenant: refToUser(doc.tenant),
    landlord: refToUser(doc.landlord),
    property: isPopulatedProperty(doc.property)
      ? serializeProperty(doc.property)
      : String((doc.property as { _id?: unknown })?._id ?? doc.property),
    status: doc.status,
    moveInDate: doc.moveInDate.toISOString(),
    amount: doc.amount,
    paymentStatus: extras.paymentStatus ?? "unpaid",
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export function serializePayment(doc: PaymentDoc): PaymentDTO {
  return {
    _id: doc._id.toString(),
    tenant: refToUser(doc.tenant),
    landlord: refToUser(doc.landlord),
    property: isPopulatedProperty(doc.property)
      ? serializeProperty(doc.property)
      : String((doc.property as { _id?: unknown })?._id ?? doc.property),
    booking: doc.booking?.toString(),
    amount: doc.amount,
    currency: doc.currency,
    status: doc.status,
    reference: doc.reference,
    splitBreakdown: doc.splitBreakdown,
    paidAt: doc.paidAt?.toISOString(),
    createdAt: doc.createdAt?.toISOString(),
    updatedAt: doc.updatedAt?.toISOString(),
  };
}

export function serializeMessage(doc: MessageDoc): MessageDTO {
  return {
    _id: doc._id.toString(),
    conversation: doc.conversation.toString(),
    sender: refToUser(doc.sender),
    text: doc.text,
    read: doc.read,
    createdAt: doc.createdAt?.toISOString(),
  };
}

export function serializeReview(doc: ReviewDoc): ReviewDTO {
  return {
    _id: doc._id.toString(),
    property: isPopulatedProperty(doc.property)
      ? serializeProperty(doc.property)
      : String((doc.property as { _id?: unknown })?._id ?? doc.property),
    author: refToUser(doc.author),
    rating: doc.rating,
    comment: doc.comment,
    createdAt: doc.createdAt?.toISOString(),
  };
}

export function serializeActivity(doc: ActivityDoc): ActivityDTO {
  return {
    _id: doc._id.toString(),
    action: doc.action,
    actor: doc.actor ? refToUser(doc.actor) : undefined,
    actorEmail: doc.actorEmail,
    actorRole: doc.actorRole,
    targetType: doc.targetType,
    targetId: doc.targetId,
    message: doc.message,
    metadata: doc.metadata,
    ip: doc.ip,
    createdAt: doc.createdAt?.toISOString(),
  };
}

/** Fields safe to populate when a listing shows its landlord. */
export const LANDLORD_PUBLIC_FIELDS = "name email avatar bio verified phone role";
