import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How RentFinder collects, uses, and protects your personal data.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  {
    heading: "What we collect",
    body: "Your name, email address, phone number, and anything you choose to add to your profile. Landlords who set up payouts also provide a mobile money number or bank account, which is sent to Paystack and stored only in the minimum form needed to identify the destination.",
  },
  {
    heading: "How we use it",
    body: "To operate your account, show your listings to renters, process bookings and payments, let you message other users, and keep the platform safe from fraud and abuse.",
  },
  {
    heading: "Passwords",
    body: "Passwords are hashed with bcrypt and are never stored, logged, or transmitted in readable form. We cannot see your password, which is why a reset link is the only way to recover an account.",
  },
  {
    heading: "Payments",
    body: "Card and mobile money details are handled entirely by Paystack and never reach RentFinder's servers. We store the transaction reference, amount, and status so payments can be reconciled.",
  },
  {
    heading: "Who we share it with",
    body: "Paystack for payment processing and Cloudinary for image hosting. We do not sell personal data. Landlords see the contact details of tenants who book their property, and tenants see the landlord's public profile.",
  },
  {
    heading: "Audit logging",
    body: "We record significant account and platform actions for security and support. These records deliberately exclude passwords, authentication tokens, and payment credentials.",
  },
  {
    heading: "Your choices",
    body: "You can update your profile at any time from your dashboard, and you can request account deletion by contacting us. Some records, such as completed payments, are retained where we are required to keep them.",
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold text-ink-900">Privacy policy</h1>
      <p className="mt-3 text-sm text-ink-500">
        How we handle your personal data.
      </p>

      <div className="mt-10 space-y-8">
        {SECTIONS.map((section) => (
          <section key={section.heading}>
            <h2 className="text-lg font-bold text-ink-900">{section.heading}</h2>
            <p className="mt-2 leading-relaxed text-ink-700">{section.body}</p>
          </section>
        ))}
      </div>

      <p className="mt-10 text-sm text-ink-500">
        Questions about your data? Email{" "}
        <a href="mailto:hello@rentfinder.gh" className="text-brand-700 hover:underline">
          hello@rentfinder.gh
        </a>
        .
      </p>
    </div>
  );
}
