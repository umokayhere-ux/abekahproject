import { connectDB } from "@/lib/db";
import { clientIp, fail, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import { requireAdmin } from "@/lib/auth";
import { ACTIONS } from "@/lib/activity";
import { User } from "@/models/User";
import { Property } from "@/models/Property";
import { Booking } from "@/models/Booking";
import { Payment } from "@/models/Payment";
import { Conversation } from "@/models/Conversation";
import { Message } from "@/models/Message";
import { Review } from "@/models/Review";
import { Activity } from "@/models/Activity";
import { RESET_SCOPES, type ResetScope } from "@/types";

/** The literal string an administrator must type to arm a reset. */
const CONFIRMATION_PHRASE = "RESET";

type Counts = Record<string, number>;

/**
 * Removes every landlord (except admins), their listings, and everything that
 * referenced those listings.
 */
async function resetLandlords(): Promise<Counts> {
  const landlords = await User.find({ role: "landlord" }).select("_id");
  const landlordIds = landlords.map((user) => user._id);

  const properties = await Property.find({
    landlord: { $in: landlordIds },
  }).select("_id");
  const propertyIds = properties.map((property) => property._id);

  const conversations = await Conversation.find({
    participants: { $in: landlordIds },
  }).select("_id");

  const [bookings, payments, reviews, messages] = await Promise.all([
    Booking.deleteMany({ landlord: { $in: landlordIds } }),
    Payment.deleteMany({ landlord: { $in: landlordIds } }),
    Review.deleteMany({ property: { $in: propertyIds } }),
    Message.deleteMany({ conversation: { $in: conversations.map((c) => c._id) } }),
  ]);

  await Conversation.deleteMany({ participants: { $in: landlordIds } });
  const removedProperties = await Property.deleteMany({
    landlord: { $in: landlordIds },
  });

  // Clear the deleted listings from every tenant's saved list.
  await User.updateMany(
    { favorites: { $in: propertyIds } },
    { $pull: { favorites: { $in: propertyIds } } },
  );

  const removedUsers = await User.deleteMany({ role: "landlord" });

  return {
    landlords: removedUsers.deletedCount ?? 0,
    properties: removedProperties.deletedCount ?? 0,
    bookings: bookings.deletedCount ?? 0,
    payments: payments.deletedCount ?? 0,
    reviews: reviews.deletedCount ?? 0,
    messages: messages.deletedCount ?? 0,
    conversations: conversations.length,
  };
}

/** Removes every tenant and the records that belong to them. */
async function resetTenants(): Promise<Counts> {
  const tenants = await User.find({ role: "tenant" }).select("_id");
  const tenantIds = tenants.map((user) => user._id);

  const conversations = await Conversation.find({
    participants: { $in: tenantIds },
  }).select("_id");

  const [bookings, payments, reviews, messages] = await Promise.all([
    Booking.deleteMany({ tenant: { $in: tenantIds } }),
    Payment.deleteMany({ tenant: { $in: tenantIds } }),
    Review.deleteMany({ author: { $in: tenantIds } }),
    Message.deleteMany({ conversation: { $in: conversations.map((c) => c._id) } }),
  ]);

  await Conversation.deleteMany({ participants: { $in: tenantIds } });
  const removedUsers = await User.deleteMany({ role: "tenant" });

  // Any listing a departed tenant had rented becomes available again.
  await Property.updateMany({ status: "rented" }, { $set: { status: "available" } });

  return {
    tenants: removedUsers.deletedCount ?? 0,
    bookings: bookings.deletedCount ?? 0,
    payments: payments.deletedCount ?? 0,
    reviews: reviews.deletedCount ?? 0,
    messages: messages.deletedCount ?? 0,
    conversations: conversations.length,
  };
}

/**
 * DELETE /api/admin/reset
 *
 * Destructive, deliberately hard to trigger by accident: it requires a valid
 * admin JWT, a recognised scope, and the exact confirmation phrase "RESET".
 * Administrator accounts are preserved by every scope, so a reset can never
 * lock the operator out of the platform.
 */
export const DELETE = withErrorHandling(async (request: Request) => {
  const auth = await requireAdmin(request);
  const body = await readJson(request);

  const v = new Validator(body);
  const scope = v.enum("scope", RESET_SCOPES, { label: "Reset scope" });
  v.assert();

  // Checked with an exact, case-sensitive comparison — no trimming, no
  // normalisation. If it is not precisely "RESET", nothing happens.
  if (body.confirm !== CONFIRMATION_PHRASE) {
    return fail(
      `This action requires confirmation. Type ${CONFIRMATION_PHRASE} exactly to proceed.`,
      400,
    );
  }

  await connectDB();

  let counts: Counts = {};

  switch (scope as ResetScope) {
    case "properties": {
      const properties = await Property.find({}).select("_id");
      const propertyIds = properties.map((property) => property._id);

      const [removed, bookings, reviews] = await Promise.all([
        Property.deleteMany({}),
        Booking.deleteMany({}),
        Review.deleteMany({}),
      ]);
      await User.updateMany(
        { favorites: { $in: propertyIds } },
        { $pull: { favorites: { $in: propertyIds } } },
      );

      counts = {
        properties: removed.deletedCount ?? 0,
        bookings: bookings.deletedCount ?? 0,
        reviews: reviews.deletedCount ?? 0,
      };
      break;
    }

    case "bookings": {
      const removed = await Booking.deleteMany({});
      // Nothing is booked any more, so every listing is back on the market.
      await Property.updateMany(
        { status: "rented" },
        { $set: { status: "available" } },
      );
      counts = { bookings: removed.deletedCount ?? 0 };
      break;
    }

    case "tenants":
      counts = await resetTenants();
      break;

    case "landlords":
      counts = await resetLandlords();
      break;

    case "full": {
      // Everything except administrator accounts and this audit trail.
      const [properties, bookings, payments, reviews, messages, conversations] =
        await Promise.all([
          Property.deleteMany({}),
          Booking.deleteMany({}),
          Payment.deleteMany({}),
          Review.deleteMany({}),
          Message.deleteMany({}),
          Conversation.deleteMany({}),
        ]);
      const users = await User.deleteMany({ role: { $ne: "admin" } });
      // Admins keep their accounts, but their stale favourites must go.
      await User.updateMany({}, { $set: { favorites: [] } });

      counts = {
        users: users.deletedCount ?? 0,
        properties: properties.deletedCount ?? 0,
        bookings: bookings.deletedCount ?? 0,
        payments: payments.deletedCount ?? 0,
        reviews: reviews.deletedCount ?? 0,
        messages: messages.deletedCount ?? 0,
        conversations: conversations.deletedCount ?? 0,
      };
      break;
    }
  }

  // Written after the deletions so the record survives a `full` reset — the
  // audit collection is never cleared by any scope.
  await Activity.create({
    action: ACTIONS.ADMIN_RESET,
    actor: auth.user._id,
    actorEmail: auth.user.email,
    actorRole: "admin",
    targetType: "Platform",
    message: `Administrator performed a "${scope}" reset`,
    metadata: { scope, counts },
    ip: clientIp(request),
  });

  return ok({
    message: `Reset complete for scope "${scope}"`,
    scope,
    deleted: counts,
  });
});
