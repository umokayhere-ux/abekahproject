"use client";

import { Home } from "lucide-react";
import { PropertyCard } from "./PropertyCard";
import { CardSkeletonGrid, EmptyState, ErrorState } from "@/components/ui/States";
import type { PropertyDTO } from "@/types";

interface PropertyGridProps {
  properties: PropertyDTO[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  favoriteIds?: Set<string>;
  onToggleFavorite?: (property: PropertyDTO) => void;
  busyFavoriteId?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

/** Responsive listing grid that also owns its loading, empty, and error states. */
export function PropertyGrid({
  properties,
  loading = false,
  error = null,
  onRetry,
  favoriteIds,
  onToggleFavorite,
  busyFavoriteId,
  emptyTitle = "No properties found",
  emptyDescription = "Try widening your search — adjust the city, price range, or property type.",
  emptyAction,
}: PropertyGridProps) {
  if (loading) return <CardSkeletonGrid />;

  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }

  if (properties.length === 0) {
    return (
      <EmptyState
        icon={Home}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {properties.map((property) => (
        <PropertyCard
          key={property._id}
          property={property}
          isFavorite={favoriteIds?.has(property._id)}
          onToggleFavorite={onToggleFavorite}
          favoriteBusy={busyFavoriteId === property._id}
        />
      ))}
    </div>
  );
}
