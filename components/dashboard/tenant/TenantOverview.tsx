"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarClock,
  CreditCard,
  Heart,
  Home,
  MessageSquare,
} from "lucide-react";
import { StatTile } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/client";
import { formatGHS } from "@/lib/money";
import type { TenantStats } from "./TenantDashboard";
import type { PropertyDTO } from "@/types";

/**
 * Tenant overview.
 *
 * Also handles the Paystack return trip: when the checkout redirects back with
 * `?reference=`, the reference is verified server-side before anything is shown
 * as paid.
 */
export function TenantOverview({
  stats,
  onNavigate,
  onRefresh,
}: {
  stats: TenantStats | null;
  onNavigate: (tab: string) => void;
  onRefresh: () => void;
}) {
  const searchParams = useSearchParams();
  const toast = useToast();
  const reference = searchParams.get("reference");
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!reference) return;

    let cancelled = false;

    // Deferred to a timer so nothing is set synchronously in the effect body.
    const timer = setTimeout(() => {
      setVerifying(true);

      apiFetch<{ status: string }>(`/api/payments/verify?reference=${reference}`)
        .then((result) => {
          if (cancelled) return;
          if (result.status === "paid") {
            toast.success("Payment received. Your booking is confirmed.");
            onRefresh();
          } else if (result.status === "failed") {
            toast.error("That payment did not go through. Please try again.");
          } else {
            toast.info("Your payment is still being processed.");
          }
        })
        .catch(() => {
          if (!cancelled) toast.error("We could not confirm that payment yet.");
        })
        .finally(() => {
          if (!cancelled) setVerifying(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Runs once per reference; the toast and refresh helpers change identity on
    // every render, so depending on them would re-verify repeatedly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  if (!stats) return <LoadingState label="Loading your overview" />;

  const booking = stats.currentBooking;
  const property =
    booking && typeof booking.property !== "string"
      ? (booking.property as PropertyDTO)
      : null;

  return (
    <div className="space-y-6">
      {verifying && (
        <div
          role="status"
          className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
        >
          Confirming your payment with Paystack…
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Heart}
          label="Saved properties"
          value={stats.savedProperties}
        />
        <StatTile
          icon={CalendarClock}
          label="Pending bookings"
          value={stats.pendingBookings}
          tone="amber"
        />
        <StatTile
          icon={MessageSquare}
          label="Unread messages"
          value={stats.unreadMessages}
          tone="sky"
        />
        <StatTile
          icon={CreditCard}
          label="Total paid"
          value={formatGHS(stats.totalPaid)}
        />
      </div>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-5"
        aria-labelledby="current-home-heading"
      >
        <h2
          id="current-home-heading"
          className="text-base font-bold text-ink-900"
        >
          Your current home
        </h2>

        {booking && property ? (
          <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <Link
                href={`/properties/${property._id}`}
                className="font-semibold text-ink-900 hover:text-brand-700 hover:underline"
              >
                {property.title}
              </Link>
              <p className="mt-1 text-sm text-ink-500">
                {property.location.city}, {property.location.state}
              </p>
              <p className="mt-2 text-sm text-ink-700">
                Move-in{" "}
                <time dateTime={booking.moveInDate}>
                  {new Date(booking.moveInDate).toLocaleDateString("en-GH", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </time>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <StatusBadge status={booking.status} kind="booking" />
              <p className="text-lg font-bold text-brand-700">
                {formatGHS(property.price)}
                <span className="text-sm font-normal text-ink-500">/mo</span>
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState
              icon={Home}
              title="You have no confirmed home yet"
              description="Browse verified rentals across Ghana and send a booking request when you find one you like."
              action={<ButtonLink href="/properties">Browse rentals</ButtonLink>}
            />
          </div>
        )}
      </section>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-5"
        aria-labelledby="recent-payments-heading"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="recent-payments-heading"
            className="text-base font-bold text-ink-900"
          >
            Recent payments
          </h2>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("payments")}>
            View all
          </Button>
        </div>

        {stats.recentPayments.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No payment history yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {stats.recentPayments.map((payment) => {
              const paidProperty =
                typeof payment.property === "string" ? null : payment.property;
              return (
                <li
                  key={payment._id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {paidProperty?.title ?? "Property"}
                    </p>
                    <p className="truncate font-mono text-xs text-ink-500">
                      {payment.reference}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge status={payment.status} kind="payment" />
                    <p className="text-sm font-semibold text-ink-900">
                      {formatGHS(payment.amount)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
