"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BareSelect } from "@/components/ui/Field";
import {
  BEDROOM_OPTIONS,
  GHANA_CITIES,
  PROPERTY_TYPE_OPTIONS,
  SORT_OPTIONS,
} from "@/lib/constants";

export interface Filters {
  q: string;
  city: string;
  type: string;
  minPrice: string;
  maxPrice: string;
  bedrooms: string;
  status: string;
  sort: string;
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  city: "",
  type: "",
  minPrice: "",
  maxPrice: "",
  bedrooms: "",
  status: "",
  sort: "newest",
};

const CITY_OPTIONS = GHANA_CITIES.map((city) => ({ value: city, label: city }));
const STATUS_OPTIONS = [
  { value: "available", label: "Available only" },
  { value: "rented", label: "Rented" },
];

/** True when anything other than the sort order has been set. */
export function hasActiveFilters(filters: Filters): boolean {
  return (
    Object.entries(filters) as [keyof Filters, string][]
  ).some(([key, value]) => key !== "sort" && value !== "");
}

const inputClass =
  "h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm placeholder:text-ink-500/70 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none";

/**
 * Filter controls for the search page. Changes are applied immediately by the
 * parent, so there is no separate apply step.
 */
export function FilterPanel({
  filters,
  onChange,
  onReset,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onReset: () => void;
}) {
  const set = (key: keyof Filters, value: string) =>
    onChange({ ...filters, [key]: value });

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-4"
      aria-label="Filter properties"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          <SlidersHorizontal className="size-4 text-ink-500" aria-hidden="true" />
          Filters
        </h2>
        {hasActiveFilters(filters) && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <X className="size-3.5" aria-hidden="true" />
            Clear all
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="filter-q" className="mb-1.5 block text-xs font-medium text-ink-700">
            Keyword
          </label>
          <input
            id="filter-q"
            type="search"
            placeholder="e.g. East Legon, self-contained"
            value={filters.q}
            onChange={(event) => set("q", event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="filter-city" className="mb-1.5 block text-xs font-medium text-ink-700">
            City
          </label>
          <BareSelect
            id="filter-city"
            label="City"
            placeholder="Any city"
            options={CITY_OPTIONS}
            value={filters.city}
            onChange={(event) => set("city", event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="filter-type" className="mb-1.5 block text-xs font-medium text-ink-700">
            Property type
          </label>
          <BareSelect
            id="filter-type"
            label="Property type"
            placeholder="Any type"
            options={PROPERTY_TYPE_OPTIONS}
            value={filters.type}
            onChange={(event) => set("type", event.target.value)}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-ink-700">
            Monthly rent (GHS)
          </legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              placeholder="Min"
              aria-label="Minimum monthly rent"
              value={filters.minPrice}
              onChange={(event) => set("minPrice", event.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              min={0}
              placeholder="Max"
              aria-label="Maximum monthly rent"
              value={filters.maxPrice}
              onChange={(event) => set("maxPrice", event.target.value)}
              className={inputClass}
            />
          </div>
        </fieldset>

        <div>
          <label htmlFor="filter-bedrooms" className="mb-1.5 block text-xs font-medium text-ink-700">
            Bedrooms
          </label>
          <BareSelect
            id="filter-bedrooms"
            label="Bedrooms"
            placeholder="Any bedrooms"
            options={BEDROOM_OPTIONS}
            value={filters.bedrooms}
            onChange={(event) => set("bedrooms", event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="filter-status" className="mb-1.5 block text-xs font-medium text-ink-700">
            Availability
          </label>
          <BareSelect
            id="filter-status"
            label="Availability"
            placeholder="Any status"
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(event) => set("status", event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="filter-sort" className="mb-1.5 block text-xs font-medium text-ink-700">
            Sort by
          </label>
          <BareSelect
            id="filter-sort"
            label="Sort by"
            options={SORT_OPTIONS}
            value={filters.sort}
            onChange={(event) => set("sort", event.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
