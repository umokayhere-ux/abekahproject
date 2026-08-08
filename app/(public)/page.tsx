import Link from "next/link";
import type { Metadata } from "next";
import {
  Building2,
  CalendarCheck,
  CreditCard,
  Home,
  KeyRound,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { connectDB } from "@/lib/db";
import { serializeProperty, LANDLORD_PUBLIC_FIELDS } from "@/lib/serialize";
import { Property } from "@/models/Property";
import { User } from "@/models/User";
import { Booking } from "@/models/Booking";
import { ButtonLink } from "@/components/ui/Button";
import { HeroSearch } from "@/components/home/HeroSearch";
import { FeaturedProperties } from "@/components/home/FeaturedProperties";
import type { PropertyDTO } from "@/types";

export const metadata: Metadata = {
  title: "Rooms, apartments and houses for rent in Ghana",
  description:
    "RentFinder connects tenants and landlords across Accra, Kumasi, Takoradi, Tema and beyond. Browse verified listings, book a home, and pay securely in Ghana cedis.",
  alternates: { canonical: "/" },
};

/** Rebuilt every 5 minutes so the counters stay fresh without a query per visit. */
export const revalidate = 300;

interface HomeData {
  featured: PropertyDTO[];
  stats: {
    availableProperties: number;
    landlords: number;
    tenants: number;
    confirmedRentals: number;
  };
}

/**
 * Reads the homepage data directly rather than through the API, since this is a
 * Server Component and an internal HTTP hop would only add latency.
 * A database outage degrades to an empty homepage instead of a crash.
 */
async function getHomeData(): Promise<HomeData> {
  try {
    await connectDB();

    const [featured, availableProperties, landlords, tenants, confirmedRentals] =
      await Promise.all([
        // Verified and available listings are what we put in front of visitors.
        Property.find({ verified: true, status: "available" })
          .populate("landlord", LANDLORD_PUBLIC_FIELDS)
          .sort({ createdAt: -1 })
          .limit(6),
        Property.countDocuments({ status: "available" }),
        User.countDocuments({ role: "landlord", suspended: false }),
        User.countDocuments({ role: "tenant", suspended: false }),
        Booking.countDocuments({ status: "confirmed" }),
      ]);

    return {
      featured: featured.map(serializeProperty),
      stats: { availableProperties, landlords, tenants, confirmedRentals },
    };
  } catch (error) {
    console.error("[home] could not load homepage data:", error);
    return {
      featured: [],
      stats: {
        availableProperties: 0,
        landlords: 0,
        tenants: 0,
        confirmedRentals: 0,
      },
    };
  }
}

const STEPS = [
  {
    icon: Search,
    title: "Search",
    body: "Filter by city, property type, budget in cedis, and number of bedrooms to find homes that actually fit.",
  },
  {
    icon: Home,
    title: "View the property",
    body: "Browse photos, amenities, and the exact location, then message the landlord with any questions.",
  },
  {
    icon: CalendarCheck,
    title: "Book",
    body: "Pick your move-in date and send a booking request. The landlord confirms it from their dashboard.",
  },
  {
    icon: KeyRound,
    title: "Pay and move in",
    body: "Pay the first month and deposit securely through Paystack. Your booking is confirmed the moment payment clears.",
  },
];

function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Home;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <Icon className="size-5.5" aria-hidden="true" />
      </span>
      <p className="text-3xl font-bold text-ink-900">
        {value.toLocaleString("en-GH")}
      </p>
      <p className="mt-1 text-sm text-ink-500">{label}</p>
    </div>
  );
}

export default async function HomePage() {
  const { featured, stats } = await getHomeData();

  return (
    <>
      <section className="border-b border-slate-200 bg-gradient-to-b from-brand-50 to-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Verified rentals across Ghana
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance text-ink-900 sm:text-5xl lg:text-6xl">
              Find your next home in Ghana
            </h1>
            <p className="mt-5 text-lg text-pretty text-ink-500">
              Rooms, apartments, houses, and studios in Accra, Kumasi, Takoradi,
              Tema, and beyond — with secure rent payments in Ghana cedis.
            </p>
          </div>

          <div className="mx-auto mt-10 max-w-5xl">
            <HeroSearch />
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="featured-heading"
      >
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2
              id="featured-heading"
              className="text-2xl font-bold text-ink-900 sm:text-3xl"
            >
              Featured properties
            </h2>
            <p className="mt-1.5 text-ink-500">
              Verified listings that are available to rent right now.
            </p>
          </div>
          <ButtonLink href="/properties" variant="outline">
            View all rentals
          </ButtonLink>
        </div>

        <FeaturedProperties properties={featured} />
      </section>

      <section
        className="border-y border-slate-200 bg-surface-muted"
        aria-labelledby="stats-heading"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 id="stats-heading" className="sr-only">
            RentFinder in numbers
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              icon={Home}
              value={stats.availableProperties}
              label="Available properties"
            />
            <StatCard
              icon={Building2}
              value={stats.landlords}
              label="Registered landlords"
            />
            <StatCard icon={Users} value={stats.tenants} label="Happy tenants" />
            <StatCard
              icon={CreditCard}
              value={stats.confirmedRentals}
              label="Successful rentals"
            />
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="how-heading"
      >
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="how-heading"
            className="text-2xl font-bold text-ink-900 sm:text-3xl"
          >
            How RentFinder works
          </h2>
          <p className="mt-2 text-ink-500">
            From first search to keys in hand, in four steps.
          </p>
        </div>

        <ol className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-600 text-white">
                <step.icon className="size-5.5" aria-hidden="true" />
              </span>
              <p className="mt-4 text-xs font-semibold tracking-wide text-brand-700 uppercase">
                Step {index + 1}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-ink-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl bg-brand-600 p-8 text-white sm:p-10">
            <h2 className="text-2xl font-bold">Looking for a home?</h2>
            <p className="mt-2.5 text-brand-50">
              Browse hundreds of verified rooms, apartments, and houses across
              Ghana. Save your favourites and book when you are ready.
            </p>
            <div className="mt-6">
              <Link
                href="/properties"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-semibold text-brand-700 transition-colors hover:bg-brand-50"
              >
                <Search className="size-4.5" aria-hidden="true" />
                Find a home
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-10">
            <h2 className="text-2xl font-bold text-ink-900">
              Have a property to rent out?
            </h2>
            <p className="mt-2.5 text-ink-500">
              List it on RentFinder, reach verified tenants, and get paid
              directly to your bank account through Paystack.
            </p>
            <div className="mt-6">
              <ButtonLink href="/auth/register?role=landlord" size="lg">
                <Building2 className="size-4.5" aria-hidden="true" />
                List a property
              </ButtonLink>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
