import type { PaymentDTO } from "@/types";

/**
 * A human label for what a payment was for.
 *
 * Registration fees have no property attached, so every list that shows
 * payments needs a sensible answer for them rather than a blank cell.
 */
export function describePayment(payment: PaymentDTO): string {
  if (payment.purpose === "registration_fee") {
    return "Landlord registration fee";
  }
  if (!payment.property) return "Property";
  return typeof payment.property === "string"
    ? "Property"
    : payment.property.title;
}
