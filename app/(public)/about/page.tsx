import type { Metadata } from "next";
import { Building2, ShieldCheck, Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "About RentFinder",
  description:
    "RentFinder is a Ghana-focused rental marketplace connecting tenants with verified landlords, with secure rent payments in Ghana cedis.",
  alternates: { canonical: "/about" },
};

const PILLARS = [
  {
    icon: ShieldCheck,
    title: "Verified listings",
    body: "Every landlord and listing can be reviewed and verified by our team before it carries the verified badge, so renters know what they are looking at.",
  },
  {
    icon: Wallet,
    title: "Secure payments",
    body: "Rent is collected through Paystack in Ghana cedis and settled directly to the landlord's bank account. No cash handovers, no guesswork.",
  },
  {
    icon: Building2,
    title: "Built for Ghana",
    body: "Cities and regions across all sixteen administrative regions, Ghanaian phone formats, and pricing in cedis — not a template adapted after the fact.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold text-ink-900">About RentFinder</h1>
      <p className="mt-4 text-lg leading-relaxed text-ink-500">
        RentFinder is a rental marketplace built for Ghana. It connects people
        looking for a home with landlords who have one to rent — and handles the
        awkward parts in between: verification, booking, and payment.
      </p>

      <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <section key={pillar.title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <span className="flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <pillar.icon className="size-5.5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-ink-900">{pillar.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">{pillar.body}</p>
          </section>
        ))}
      </div>

      <section className="mt-12">
        <h2 className="text-2xl font-bold text-ink-900">How we make money</h2>
        <p className="mt-3 leading-relaxed text-ink-700">
          Landlords pay a one-off GHS 1 registration fee to start listing, and
          we take a 5% commission on rent collected through the platform. The
          tenant pays exactly the rent that is listed — the commission comes out
          of the landlord&apos;s side, so there are no surprise fees at checkout.
        </p>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <ButtonLink href="/properties" size="lg">Browse rentals</ButtonLink>
        <ButtonLink href="/auth/register?role=landlord" variant="outline" size="lg">
          List a property
        </ButtonLink>
      </div>
    </div>
  );
}
