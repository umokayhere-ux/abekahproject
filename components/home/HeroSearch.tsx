"use client";

import { useRouter } from "next/navigation";
import { SearchBar, type SearchValues } from "@/components/property/SearchBar";
import { buildQuery } from "@/lib/client";

/**
 * Wraps the shared search bar and turns a submission into a navigation to the
 * results page, so the search state lives in the URL and stays shareable.
 */
export function HeroSearch() {
  const router = useRouter();

  const handleSearch = (values: SearchValues) => {
    router.push(`/properties${buildQuery({ ...values })}`);
  };

  return <SearchBar onSearch={handleSearch} submitLabel="Search rentals" />;
}
