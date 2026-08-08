"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { PropertyGrid } from "@/components/property/PropertyGrid";
import { ButtonLink } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import type { PropertyDTO, SafeUser } from "@/types";

/**
 * The tenant's saved listings.
 *
 * The favourite ids live on the user record, so each is fetched individually
 * and any that has since been deleted is simply skipped.
 */
export function SavedProperties({ onChanged }: { onChanged: () => void }) {
  const { user, setUser } = useAuth();
  const toast = useToast();

  const [properties, setProperties] = useState<PropertyDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const load = () => setReloadNonce((value) => value + 1);

  const favoriteIds = user?.favorites ?? [];
  // A primitive key, so the effect re-runs when the saved set actually changes
  // rather than on every render (the array identity is new each time).
  const favoriteKey = favoriteIds.join(",");

  useEffect(() => {
    const ids = favoriteKey ? favoriteKey.split(",") : [];
    let cancelled = false;

    // All state updates happen after an await, never in the effect body.
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          ids.map((id) =>
            apiFetch<{ property: PropertyDTO }>(`/api/properties/${id}`)
              .then((data) => data.property)
              // A saved listing may have been removed by its landlord.
              .catch(() => null),
          ),
        );
        if (cancelled) return;
        setProperties(results.filter((item): item is PropertyDTO => item !== null));
      } catch {
        if (!cancelled) setError("We could not load your saved properties.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [favoriteKey, reloadNonce]);

  const handleRemove = async (property: PropertyDTO) => {
    setBusyId(property._id);
    try {
      const data = await apiFetch<{ user: SafeUser }>(
        `/api/properties/${property._id}/favorite`,
        { method: "DELETE" },
      );
      setUser(data.user);
      setProperties((current) =>
        current.filter((item) => item._id !== property._id),
      );
      toast.success("Removed from saved properties");
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not remove that property",
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="saved-heading">
      <div className="mb-5 flex items-center gap-2">
        <Heart className="size-5 text-ink-500" aria-hidden="true" />
        <h2 id="saved-heading" className="text-lg font-bold text-ink-900">
          Saved properties
        </h2>
      </div>

      <PropertyGrid
        properties={properties}
        loading={loading}
        error={error}
        onRetry={load}
        favoriteIds={new Set(favoriteIds)}
        onToggleFavorite={handleRemove}
        busyFavoriteId={busyId}
        emptyTitle="No saved properties yet"
        emptyDescription="Tap the heart on any listing to save it here for later."
        emptyAction={<ButtonLink href="/properties">Browse rentals</ButtonLink>}
      />
    </section>
  );
}
