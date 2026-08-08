"use client";

import Image from "next/image";
import Link from "next/link";
import { Bath, BedDouble, Heart, ImageOff, MapPin } from "lucide-react";
import { StatusBadge, VerifiedBadge } from "@/components/ui/Badge";
import { formatRent } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { PropertyDTO } from "@/types";

interface PropertyCardProps {
  property: PropertyDTO;
  /** Rendered only when a favourite handler is supplied (tenants). */
  isFavorite?: boolean;
  onToggleFavorite?: (property: PropertyDTO) => void;
  favoriteBusy?: boolean;
}

export function PropertyCard({
  property,
  isFavorite = false,
  onToggleFavorite,
  favoriteBusy = false,
}: PropertyCardProps) {
  const image = property.images?.[0];
  const href = `/properties/${property._id}`;

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition-shadow hover:shadow-lg">
      <div className="relative h-48 shrink-0 bg-surface-sunken">
        {image ? (
          <Image
            src={image}
            // Descriptive alt so the listing is understandable without sight.
            alt={`${property.title} in ${property.location.city}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-500">
            <ImageOff className="size-8" aria-hidden="true" />
            <span className="sr-only">No photo provided</span>
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {property.verified && <VerifiedBadge verified />}
          {property.status === "rented" && (
            <StatusBadge status="rented" kind="property" />
          )}
        </div>

        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(property)}
            disabled={favoriteBusy}
            aria-pressed={isFavorite}
            aria-label={
              isFavorite
                ? `Remove ${property.title} from saved properties`
                : `Save ${property.title} to your properties`
            }
            className="absolute top-3 right-3 rounded-full bg-white/95 p-2 shadow-sm transition-colors hover:bg-white disabled:opacity-60"
          >
            <Heart
              className={cn(
                "size-4.5 transition-colors",
                isFavorite ? "fill-red-500 text-red-500" : "text-ink-700",
              )}
              aria-hidden="true"
            />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-semibold text-ink-900">
          {/* Stretched link keeps the whole card clickable with one tab stop. */}
          <Link href={href} className="after:absolute after:inset-0">
            <span className="line-clamp-1">{property.title}</span>
          </Link>
        </h3>

        <p className="mt-1 flex items-center gap-1 text-sm text-ink-500">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="line-clamp-1">
            {property.location.city}, {property.location.state}
          </span>
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-700">
          <span className="flex items-center gap-1.5">
            <BedDouble className="size-4 text-ink-500" aria-hidden="true" />
            {property.bedrooms} bed{property.bedrooms === 1 ? "" : "s"}
          </span>
          <span className="flex items-center gap-1.5">
            <Bath className="size-4 text-ink-500" aria-hidden="true" />
            {property.bathrooms} bath{property.bathrooms === 1 ? "" : "s"}
          </span>
          <span className="capitalize text-ink-500">{property.type}</span>
        </div>

        <div className="mt-auto flex items-end justify-between pt-4">
          <p className="text-lg font-bold text-brand-700">
            {formatRent(property.price)}
          </p>
          {/* Decorative: the stretched link above is the real control. */}
          <span
            className="relative z-10 text-sm font-semibold text-brand-700 group-hover:underline"
            aria-hidden="true"
          >
            View details
          </span>
        </div>
      </div>
    </article>
  );
}
