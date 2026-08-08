"use client";

import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BareSelect } from "@/components/ui/Field";
import { GHANA_CITIES, PROPERTY_TYPE_OPTIONS, BEDROOM_OPTIONS } from "@/lib/constants";

export interface SearchValues {
  city: string;
  type: string;
  minPrice: string;
  maxPrice: string;
  bedrooms: string;
}

export const EMPTY_SEARCH: SearchValues = {
  city: "",
  type: "",
  minPrice: "",
  maxPrice: "",
  bedrooms: "",
};

const CITY_OPTIONS = GHANA_CITIES.map((city) => ({ value: city, label: city }));

/**
 * The hero search. Submits as a real form so Enter works from any field and
 * the whole thing is keyboard-operable.
 */
export function SearchBar({
  initial = EMPTY_SEARCH,
  onSearch,
  submitLabel = "Search",
}: {
  initial?: SearchValues;
  onSearch: (values: SearchValues) => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState<SearchValues>(initial);

  const update = (key: keyof SearchValues) => (value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(values);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-lg sm:p-4"
      role="search"
      aria-label="Search rental properties"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <BareSelect
            label="City"
            placeholder="Any city"
            options={CITY_OPTIONS}
            value={values.city}
            onChange={(event) => update("city")(event.target.value)}
          />
        </div>

        <BareSelect
          label="Property type"
          placeholder="Any type"
          options={PROPERTY_TYPE_OPTIONS}
          value={values.type}
          onChange={(event) => update("type")(event.target.value)}
        />

        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min GHS"
            aria-label="Minimum monthly rent in Ghana cedis"
            value={values.minPrice}
            onChange={(event) => update("minPrice")(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm placeholder:text-ink-500/70 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
          />
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max GHS"
            aria-label="Maximum monthly rent in Ghana cedis"
            value={values.maxPrice}
            onChange={(event) => update("maxPrice")(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm placeholder:text-ink-500/70 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
          />
        </div>

        <BareSelect
          label="Bedrooms"
          placeholder="Any bedrooms"
          options={BEDROOM_OPTIONS}
          value={values.bedrooms}
          onChange={(event) => update("bedrooms")(event.target.value)}
        />
      </div>

      <div className="mt-3">
        <Button type="submit" size="lg" fullWidth>
          <Search className="size-4.5" aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
