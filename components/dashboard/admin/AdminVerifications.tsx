"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import { useApiResource } from "@/hooks/useApiResource";
import { formatGHS } from "@/lib/money";
import type { PropertyDTO, SafeUser } from "@/types";

interface VerificationQueue {
  landlords: (SafeUser & { listingCount: number })[];
  landlordTotal: number;
  properties: PropertyDTO[];
  propertyTotal: number;
}

/**
 * The verification queue: landlords and listings awaiting approval.
 *
 * Approving reuses the existing users/properties PATCH endpoints so there is a
 * single authorisation path per action.
 */
export function AdminVerifications({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();

  const [busyId, setBusyId] = useState<string | null>(null);

  const {
    data: queue,
    loading,
    error,
    refetch: load,
  } = useApiResource<VerificationQueue>("/api/admin/verifications", {
    fallbackMessage: "Could not load the verification queue",
  });

  const decideLandlord = async (landlord: SafeUser, approve: boolean) => {
    setBusyId(landlord._id);
    try {
      await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: {
          userId: landlord._id,
          // Rejecting suspends the account rather than deleting it, so the
          // decision is reversible.
          action: approve ? "verify" : "suspend",
        },
      });
      toast.success(
        approve ? `${landlord.name} verified` : `${landlord.name} rejected`,
      );
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not update that landlord",
      );
    } finally {
      setBusyId(null);
    }
  };

  const decideProperty = async (property: PropertyDTO) => {
    setBusyId(property._id);
    try {
      await apiFetch("/api/admin/properties", {
        method: "PATCH",
        body: { propertyId: property._id, action: "verify" },
      });
      toast.success("Property verified");
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not verify that property",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingState label="Loading verification queue" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!queue) return null;

  const nothingPending =
    queue.landlords.length === 0 && queue.properties.length === 0;

  if (nothingPending) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing awaiting verification"
        description="All landlords and listings have been reviewed. New submissions will appear here."
      />
    );
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="landlord-queue-heading">
        <h2
          id="landlord-queue-heading"
          className="mb-4 text-lg font-bold text-ink-900"
        >
          Landlords awaiting verification ({queue.landlordTotal})
        </h2>

        {queue.landlords.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-ink-500">
            No landlords are waiting for verification.
          </p>
        ) : (
          <ul className="space-y-3">
            {queue.landlords.map((landlord) => (
              <li
                key={landlord._id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <UserAvatar
                    name={landlord.name}
                    src={landlord.avatar}
                    size="lg"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900">
                      {landlord.name}
                    </p>
                    <p className="truncate text-sm text-ink-500">
                      {landlord.email}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {landlord.listingCount} listing
                      {landlord.listingCount === 1 ? "" : "s"}
                      {landlord.phone ? ` · ${landlord.phone}` : ""}
                      {landlord.hasPayoutAccount ? " · payout connected" : ""}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Button
                    loading={busyId === landlord._id}
                    onClick={() => decideLandlord(landlord, true)}
                  >
                    <BadgeCheck className="size-4" aria-hidden="true" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => decideLandlord(landlord, false)}
                  >
                    <X className="size-4" aria-hidden="true" />
                    Reject
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="property-queue-heading">
        <h2
          id="property-queue-heading"
          className="mb-4 text-lg font-bold text-ink-900"
        >
          Listings awaiting verification ({queue.propertyTotal})
        </h2>

        {queue.properties.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-ink-500">
            No listings are waiting for verification.
          </p>
        ) : (
          <ul className="space-y-3">
            {queue.properties.map((property) => (
              <li
                key={property._id}
                className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/properties/${property._id}`}
                    className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                  >
                    {property.title}
                  </Link>
                  <p className="mt-0.5 text-sm text-ink-500">
                    {property.location.city}, {property.location.state} &middot;{" "}
                    {formatGHS(property.price)}/month
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Listed by{" "}
                    {typeof property.landlord === "string"
                      ? "unknown"
                      : property.landlord.name}{" "}
                    &middot; {property.images.length} photo
                    {property.images.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/properties/${property._id}`}
                    className="inline-flex h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-ink-900 transition-colors hover:bg-surface-muted"
                  >
                    Review
                  </Link>
                  <Button
                    loading={busyId === property._id}
                    onClick={() => decideProperty(property)}
                  >
                    <BadgeCheck className="size-4" aria-hidden="true" />
                    Verify
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
