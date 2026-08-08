"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, Mail, Phone, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/Badge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import { useApiResource } from "@/hooks/useApiResource";
import { formatGHS } from "@/lib/money";
import type { BookingDTO, Paginated, PropertyDTO, SafeUser } from "@/types";

/**
 * Booking requests on this landlord's listings.
 *
 * The API only ever returns bookings where `landlord` is the signed-in user,
 * so unrelated bookings are unreachable here.
 */
export function LandlordBookings({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingDTO | null>(null);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<Paginated<BookingDTO>>("/api/bookings", {
    fallbackMessage: "Could not load bookings",
  });
  const bookings = data?.items ?? [];

  const updateStatus = async (
    booking: BookingDTO,
    status: "confirmed" | "cancelled",
  ) => {
    setBusyId(booking._id);
    try {
      await apiFetch(`/api/bookings/${booking._id}`, {
        method: "PATCH",
        body: { status },
      });
      toast.success(status === "confirmed" ? "Booking confirmed" : "Booking cancelled");
      setCancelTarget(null);
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not update the booking",
      );
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <LoadingState label="Loading bookings" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No booking requests yet"
        description="When a tenant requests one of your properties, it will appear here for you to confirm."
      />
    );
  }

  return (
    <>
      <ul className="space-y-4">
        {bookings.map((booking) => {
          const property =
            typeof booking.property === "string"
              ? null
              : (booking.property as PropertyDTO);
          const tenant =
            typeof booking.tenant === "string"
              ? null
              : (booking.tenant as SafeUser);

          const isPending = booking.status === "pending";
          const isPaid = booking.paymentStatus === "paid";

          return (
            <li
              key={booking._id}
              className="rounded-2xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={booking.status} kind="booking" />
                    <StatusBadge
                      status={booking.paymentStatus ?? "unpaid"}
                      kind="payment"
                    />
                  </div>

                  {property && (
                    <Link
                      href={`/properties/${property._id}`}
                      className="mt-3 block font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                    >
                      {property.title}
                    </Link>
                  )}

                  <div className="mt-3 flex items-start gap-3 rounded-xl bg-surface-muted p-3">
                    <UserAvatar
                      name={tenant?.name ?? "Tenant"}
                      src={tenant?.avatar}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-ink-900">
                        {tenant?.name ?? "Tenant"}
                      </p>
                      <div className="mt-1 space-y-0.5 text-xs text-ink-500">
                        {tenant?.email && (
                          <p className="flex items-center gap-1.5">
                            <Mail className="size-3.5" aria-hidden="true" />
                            <a
                              href={`mailto:${tenant.email}`}
                              className="hover:underline"
                            >
                              {tenant.email}
                            </a>
                          </p>
                        )}
                        {tenant?.phone && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="size-3.5" aria-hidden="true" />
                            <a
                              href={`tel:${tenant.phone}`}
                              className="hover:underline"
                            >
                              {tenant.phone}
                            </a>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <dt className="text-ink-500">Move-in date</dt>
                      <dd className="text-ink-900">
                        <time dateTime={booking.moveInDate}>
                          {new Date(booking.moveInDate).toLocaleDateString("en-GH", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </time>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-500">You receive</dt>
                      <dd className="font-semibold text-ink-900">
                        {/* The landlord absorbs the 10% platform commission. */}
                        {formatGHS((booking.amount ?? 0) * 0.9)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {isPending && (
                    <Button
                      onClick={() => updateStatus(booking, "confirmed")}
                      loading={busyId === booking._id}
                    >
                      <Check className="size-4" aria-hidden="true" />
                      Confirm
                    </Button>
                  )}
                  {booking.status !== "cancelled" && !isPaid && (
                    <Button
                      variant="outline"
                      onClick={() => setCancelTarget(booking)}
                    >
                      <X className="size-4" aria-hidden="true" />
                      Cancel
                    </Button>
                  )}
                  {isPaid && (
                    <p className="self-center text-sm font-medium text-brand-700">
                      Paid
                    </p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmationModal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={() =>
          cancelTarget && updateStatus(cancelTarget, "cancelled")
        }
        loading={busyId !== null}
        destructive
        title="Cancel this booking?"
        description="The tenant will be notified and your property will become available again."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
      />
    </>
  );
}
