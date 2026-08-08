"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CreditCard } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import { useApiResource } from "@/hooks/useApiResource";
import { formatGHS } from "@/lib/money";
import type { BookingDTO, Paginated, PropertyDTO, SafeUser } from "@/types";

/**
 * The tenant's bookings, with the pay-now action.
 *
 * Paying redirects to Paystack; the booking is only confirmed once the webhook
 * (or the callback verification) settles the payment server-side.
 */
export function TenantBookings({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();

  const [payingId, setPayingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingDTO | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<Paginated<BookingDTO>>("/api/bookings", {
    fallbackMessage: "Could not load your bookings",
  });
  const bookings = data?.items ?? [];

  const handlePay = async (booking: BookingDTO) => {
    setPayingId(booking._id);
    try {
      const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(
        "/api/payments/initialize",
        { method: "POST", body: { bookingId: booking._id } },
      );
      // Hand off to Paystack's hosted checkout. `assign` rather than setting
      // `location.href`, which the React compiler treats as a mutation.
      window.location.assign(authorizationUrl);
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not start the payment",
      );
      setPayingId(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/bookings/${cancelTarget._id}`, {
        method: "PATCH",
        body: { status: "cancelled" },
      });
      toast.success("Booking cancelled");
      setCancelTarget(null);
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not cancel the booking",
      );
    } finally {
      setCancelling(false);
    }
  };

  if (loading) return <LoadingState label="Loading your bookings" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No bookings yet"
        description="When you request a property, it will appear here so you can track its status and pay."
        action={<ButtonLink href="/properties">Browse rentals</ButtonLink>}
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
          const landlord =
            typeof booking.landlord === "string"
              ? null
              : (booking.landlord as SafeUser);

          const isPaid = booking.paymentStatus === "paid";
          const canPay = booking.status !== "cancelled" && !isPaid;
          const canCancel = booking.status === "pending";

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

                  {property ? (
                    <Link
                      href={`/properties/${property._id}`}
                      className="mt-3 block font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                    >
                      {property.title}
                    </Link>
                  ) : (
                    <p className="mt-3 font-semibold text-ink-500">
                      This property is no longer listed
                    </p>
                  )}

                  <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    {property && (
                      <div>
                        <dt className="text-ink-500">Location</dt>
                        <dd className="text-ink-900">
                          {property.location.city}, {property.location.state}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-ink-500">Landlord</dt>
                      <dd className="text-ink-900">{landlord?.name ?? "—"}</dd>
                    </div>
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
                      <dt className="text-ink-500">Amount due</dt>
                      <dd className="font-semibold text-ink-900">
                        {formatGHS(booking.amount ?? 0)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {canPay && (
                    <Button
                      onClick={() => handlePay(booking)}
                      loading={payingId === booking._id}
                    >
                      <CreditCard className="size-4" aria-hidden="true" />
                      Pay now
                    </Button>
                  )}
                  {canCancel && (
                    <Button
                      variant="outline"
                      onClick={() => setCancelTarget(booking)}
                    >
                      Cancel
                    </Button>
                  )}
                  {isPaid && (
                    <p className="self-center text-sm font-medium text-brand-700">
                      Paid in full
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
        onConfirm={handleCancel}
        loading={cancelling}
        destructive
        title="Cancel this booking?"
        description="The landlord will be notified and the property will become available to other tenants. This cannot be undone."
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
      />
    </>
  );
}
