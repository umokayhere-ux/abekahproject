"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { PropertyGrid } from "./PropertyGrid";
import { DEFAULT_FILTERS, FilterPanel, type Filters } from "./FilterPanel";
import { Pagination } from "@/components/ui/Pagination";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch, buildQuery } from "@/lib/client";
import type { Paginated, PropertyDTO, SafeUser } from "@/types";

/** How long to wait after typing before re-querying. */
const DEBOUNCE_MS = 350;

/** Reads the current filter state out of the URL. */
function filtersFromParams(params: URLSearchParams): Filters {
  return {
    q: params.get("q") ?? "",
    city: params.get("city") ?? "",
    type: params.get("type") ?? "",
    minPrice: params.get("minPrice") ?? "",
    maxPrice: params.get("maxPrice") ?? "",
    bedrooms: params.get("bedrooms") ?? "",
    status: params.get("status") ?? "",
    sort: params.get("sort") ?? "newest",
  };
}

export function PropertySearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { user, setUser } = useAuth();

  const [filters, setFilters] = useState<Filters>(() =>
    filtersFromParams(new URLSearchParams(searchParams.toString())),
  );
  const [page, setPage] = useState(() => Number(searchParams.get("page")) || 1);
  const [results, setResults] = useState<Paginated<PropertyDTO> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [busyFavoriteId, setBusyFavoriteId] = useState<string | null>(null);

  const favoriteIds = useMemo(
    () => new Set(user?.favorites ?? []),
    [user?.favorites],
  );

  // Only tenants can save listings, so the heart is hidden for everyone else.
  const canFavorite = user?.role === "tenant";

  const query = useMemo(
    () => buildQuery({ ...filters, page, limit: 12 }),
    [filters, page],
  );

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetch<Paginated<PropertyDTO>>(
          `/api/properties${query}`,
          { signal },
        );
        setResults(data);
      } catch (caught) {
        if (signal.aborted) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "We could not load properties. Please check your connection.",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [query],
  );

  // Debounced so typing in the keyword box does not fire a request per keypress.
  const isFirstRun = useRef(true);
  useEffect(() => {
    const controller = new AbortController();
    const delay = isFirstRun.current ? 0 : DEBOUNCE_MS;
    isFirstRun.current = false;

    const timer = setTimeout(() => void load(controller.signal), delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  // Mirror the state into the URL so results can be shared and bookmarked.
  useEffect(() => {
    router.replace(`/properties${query}`, { scroll: false });
  }, [query, router]);

  const handleFilterChange = (next: Filters) => {
    setFilters(next);
    // Any filter change invalidates the current page number.
    setPage(1);
  };

  const handleReset = () => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  };

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleFavorite = async (property: PropertyDTO) => {
    if (!user) {
      toast.info("Sign in as a tenant to save properties");
      router.push("/auth/login");
      return;
    }
    if (user.role !== "tenant") {
      toast.info("Only tenant accounts can save properties");
      return;
    }

    const isSaved = favoriteIds.has(property._id);
    setBusyFavoriteId(property._id);
    try {
      const data = await apiFetch<{ user: SafeUser }>(
        `/api/properties/${property._id}/favorite`,
        { method: isSaved ? "DELETE" : "POST" },
      );
      setUser(data.user);
      toast.success(isSaved ? "Removed from saved properties" : "Property saved");
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not update saved properties",
      );
    } finally {
      setBusyFavoriteId(null);
    }
  };

  const total = results?.total ?? 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_1fr]">
      {/* Filters: a collapsible drawer on mobile, always visible on desktop. */}
      <div className="lg:hidden">
        <Button
          variant="outline"
          fullWidth
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          aria-controls="filter-panel"
        >
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          {showFilters ? "Hide filters" : "Show filters"}
        </Button>
      </div>

      <div
        id="filter-panel"
        className={showFilters ? "lg:block" : "hidden lg:block"}
      >
        <div className="lg:sticky lg:top-24">
          <FilterPanel
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleReset}
          />
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-5 flex items-center justify-between gap-4">
          <p className="text-sm text-ink-500" role="status" aria-live="polite">
            {loading
              ? "Searching…"
              : `${total.toLocaleString("en-GH")} propert${total === 1 ? "y" : "ies"} found`}
          </p>
        </div>

        <PropertyGrid
          properties={results?.items ?? []}
          loading={loading}
          error={error}
          onRetry={() => void load(new AbortController().signal)}
          favoriteIds={canFavorite ? favoriteIds : undefined}
          onToggleFavorite={canFavorite || !user ? toggleFavorite : undefined}
          busyFavoriteId={busyFavoriteId}
          emptyAction={
            <ButtonLink href="/properties" variant="outline">
              Clear search
            </ButtonLink>
          }
        />

        {results && results.totalPages > 1 && (
          <Pagination
            page={results.page}
            totalPages={results.totalPages}
            onPageChange={handlePageChange}
            className="mt-10"
          />
        )}
      </div>
    </div>
  );
}
