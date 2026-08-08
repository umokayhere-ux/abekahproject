"use client";

import { PropertyGrid } from "@/components/property/PropertyGrid";
import { ButtonLink } from "@/components/ui/Button";
import type { PropertyDTO } from "@/types";

/**
 * Featured listings. Rendered as a client component so the grid's shared empty
 * state and card interactions work, but the data is fetched on the server.
 */
export function FeaturedProperties({
  properties,
}: {
  properties: PropertyDTO[];
}) {
  return (
    <PropertyGrid
      properties={properties}
      emptyTitle="No featured properties yet"
      emptyDescription="Verified listings will appear here as landlords add them. In the meantime, browse everything that is available."
      emptyAction={<ButtonLink href="/properties">Browse all rentals</ButtonLink>}
    />
  );
}
