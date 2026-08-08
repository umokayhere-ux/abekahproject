import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms governing use of the RentFinder rental marketplace.",
  alternates: { canonical: "/terms" },
};

const SECTIONS = [
  {
    heading: "1. Using RentFinder",
    body: "RentFinder is a marketplace that connects tenants with landlords in Ghana. We provide the platform; the rental agreement itself is between the tenant and the landlord. You must be at least 18 years old to hold an account.",
  },
  {
    heading: "2. Accounts",
    body: "You are responsible for keeping your password confidential and for all activity under your account. Accounts may be suspended if we find fraudulent listings, misrepresentation, or abuse of other users.",
  },
  {
    heading: "3. Listings",
    body: "Landlords are responsible for the accuracy of their listings, including price, location, and availability. A verified badge indicates that our team has reviewed the listing; it is not a guarantee of condition or title.",
  },
  {
    heading: "4. Bookings and payments",
    body: "A booking request becomes binding once the landlord confirms it and payment has settled. Payments are processed by Paystack in Ghana cedis. RentFinder retains a 10% platform commission, which is deducted from the landlord's share; tenants pay the listed amount.",
  },
  {
    heading: "5. Refunds and disputes",
    body: "Disputes about a property should first be raised with the landlord through the platform's messaging. Where a payment was taken in error, contact us with the payment reference and we will investigate with Paystack.",
  },
  {
    heading: "6. Prohibited use",
    body: "Do not post listings you are not authorised to rent, misrepresent a property, harass other users, or attempt to circumvent the platform's payment flow.",
  },
  {
    heading: "7. Liability",
    body: "RentFinder is not a party to the tenancy agreement and is not liable for the condition of a property, the conduct of a landlord or tenant, or losses arising from a rental arrangement made through the platform.",
  },
  {
    heading: "8. Changes",
    body: "We may update these terms. Continued use of RentFinder after a change constitutes acceptance of the revised terms.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold text-ink-900">Terms of service</h1>
      <p className="mt-3 text-sm text-ink-500">
        These terms govern your use of RentFinder.
      </p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-bold text-ink-900">{section.heading}</h2>
            <p className="mt-2 leading-relaxed text-ink-700">{section.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
