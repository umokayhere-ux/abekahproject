import type { Metadata } from "next";
import { Suspense } from "react";
import { CardSkeletonGrid } from "@/components/ui/States";
import { PropertySearch } from "@/components/property/PropertySearch";

export const metadata: Metadata = {
  title: "Browse rentals across Ghana",
  description:
    "Search verified rooms, apartments, houses, and studios for rent in Accra, Kumasi, Takoradi, Tema, Cape Coast and more. Filter by city, budget in Ghana cedis, and bedrooms.",
  alternates: { canonical: "/properties" },
};

/**
 * The search page reads its state from the query string, so the interactive
 * body is a Client Component behind a Suspense boundary (required by Next for
 * `useSearchParams`).
 */
export default function PropertiesPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900">Browse rentals</h1>
        <p className="mt-1.5 text-ink-500">
          Find rooms, apartments, houses, and studios for rent across Ghana.
        </p>
      </header>

      <Suspense fallback={<CardSkeletonGrid />}>
        <PropertySearch />
      </Suspense>
    </div>
  );
}
