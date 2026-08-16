import { connectDB } from "@/lib/db";
import { clientIp, fail, notFound, ok, withErrorHandling } from "@/lib/api";
import { Validator, readJson } from "@/lib/validate";
import { requireRole } from "@/lib/auth";
import { ACTIONS, logActivity } from "@/lib/activity";
import { computeSplit } from "@/lib/money";
import { env } from "@/lib/env";
import { generateReference, initializeTransaction } from "@/lib/paystack";
import { Booking } from "@/models/Booking";
import { Property } from "@/models/Property";
import { Payment } from "@/models/Payment";
import { User } from "@/models/User";

/**
 * POST /api/payments/initialize
 *
 * Starts a Paystack checkout for a booking.
 *
 * The charge is computed from the stored property price via `computeSplit` —
 * no amount is ever read from the request body. The landlord's 95% is routed
 * to their subaccount and the platform retains 5%.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const auth = await requireRole(request, "tenant");
  const body = await readJson(request);

  const v = new Validator(body);
  const bookingId = v.objectId("bookingId", { label: "Booking" });
  v.assert();

  await connectDB();

  const booking = await Booking.findById(bookingId);
  if (!booking) return notFound("That booking could not be found");

  // Ownership: a tenant may only pay for their own booking.
  if (booking.tenant.toString() !== auth.userId) {
    return fail("You can only pay for your own booking", 403);
  }
  if (booking.status === "cancelled") {
    return fail("This booking has been cancelled and cannot be paid for", 409);
  }

  const alreadyPaid = await Payment.exists({
    booking: booking._id,
    status: "paid",
  });
  if (alreadyPaid) {
    return fail("This booking has already been paid for", 409);
  }

  const property = await Property.findById(booking.property);
  if (!property) return notFound("The property for this booking no longer exists");

  // The subaccount is `select: false`, so it must be requested explicitly.
  const landlord = await User.findById(booking.landlord).select(
    "+paystackSubaccount name email suspended",
  );
  if (!landlord || landlord.suspended) {
    return fail("This landlord is not currently able to receive payments", 409);
  }
  if (!landlord.paystackSubaccount) {
    return fail(
      "The landlord has not finished setting up their payout account yet. Please try again later.",
      409,
    );
  }

  // Authoritative amount: derived from the property, not the client.
  const split = computeSplit(property.price);
  const reference = generateReference();

  // Recorded as pending before Paystack is called, so a webhook that arrives
  // before this request finishes still finds a row to reconcile against.
  const payment = await Payment.create({
    tenant: auth.userId,
    landlord: landlord._id,
    property: property._id,
    booking: booking._id,
    amount: split.total,
    currency: "GHS",
    status: "pending",
    reference,
    splitBreakdown: split,
  });

  try {
    const transaction = await initializeTransaction({
      email: auth.user.email,
      amountCedis: split.total,
      reference,
      subaccountCode: landlord.paystackSubaccount,
      callbackUrl: `${env.appUrl}/dashboard/tenant?tab=payments&reference=${reference}`,
      metadata: {
        bookingId: booking._id.toString(),
        propertyId: property._id.toString(),
        propertyTitle: property.title,
        tenantId: auth.userId,
        landlordId: landlord._id.toString(),
      },
    });

    // Keep the booking's snapshot in step with what is actually being charged.
    if (booking.amount !== split.total) {
      booking.amount = split.total;
      await booking.save();
    }

    await logActivity({
      action: ACTIONS.PAYMENT_INITIALIZED,
      actor: auth.user,
      targetType: "Payment",
      targetId: payment._id.toString(),
      message: `Payment initialised for ${property.title}`,
      metadata: { reference, amount: split.total, currency: "GHS" },
      ip: clientIp(request),
    });

    return ok({
      authorizationUrl: transaction.authorization_url,
      accessCode: transaction.access_code,
      reference,
      amount: split.total,
      currency: "GHS",
      breakdown: split,
    });
  } catch (error) {
    // Paystack refused the initialisation; do not leave a dangling pending row.
    payment.status = "failed";
    payment.failureReason = "Initialisation with Paystack failed";
    await payment.save();
    throw error;
  }
});
