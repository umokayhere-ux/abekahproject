"use client";

import Link from "next/link";
import { AlertTriangle, Building2, CalendarCheck, Eye, Wallet } from "lucide-react";
import { StatTile } from "@/components/dashboard/DashboardShell";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/States";
import { formatGHS } from "@/lib/money";
import type { LandlordStats } from "./LandlordDashboard";
import { RegistrationFeeBanner } from "./RegistrationFeeBanner";
import type { PropertyDTO, SafeUser } from "@/types";

export function LandlordOverview({
  stats,
  onNavigate,
  onRefresh,
}: {
  stats: LandlordStats | null;
  onNavigate: (tab: string) => void;
  onRefresh: () => void;
}) {
  if (!stats) return <LoadingState label="Loading your overview" />;

  return (
    <div className="space-y-6">
      {/* The fee gates listing entirely, so it outranks the payout prompt. */}
      {!stats.registrationFeePaid && (
        <RegistrationFeeBanner onPaid={onRefresh} />
      )}

      {/* Without a payout account, payments for this landlord cannot be
          initialised at all — so this is the next thing they should see. */}
      {!stats.payoutConfigured && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <div>
              <p className="font-semibold text-amber-900">
                Set up your payout account
              </p>
              <p className="mt-0.5 text-sm text-amber-800">
                Tenants cannot pay for your properties until you connect a
                mobile money wallet or bank account.
              </p>
            </div>
          </div>
          <Button onClick={() => onNavigate("payouts")}>Set up payouts</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Wallet}
          label="Total earnings"
          value={formatGHS(stats.earnings)}
          hint={`From ${stats.paymentsReceived} settled payment${stats.paymentsReceived === 1 ? "" : "s"}`}
        />
        <StatTile
          icon={Building2}
          label="Listings"
          value={stats.totalListings}
          hint={`${stats.availableListings} available, ${stats.verifiedListings} verified`}
          tone="sky"
        />
        <StatTile
          icon={CalendarCheck}
          label="Bookings"
          value={stats.totalBookings}
          hint={`${stats.pendingBookings} awaiting your response`}
          tone="amber"
        />
        <StatTile
          icon={Eye}
          label="Property views"
          value={stats.totalViews}
          tone="slate"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section
          className="rounded-2xl border border-slate-200 bg-white p-5"
          aria-labelledby="recent-bookings-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="recent-bookings-heading"
              className="text-base font-bold text-ink-900"
            >
              Recent bookings
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("bookings")}
            >
              View all
            </Button>
          </div>

          {stats.recentBookings.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No bookings yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.recentBookings.map((booking) => {
                const property =
                  typeof booking.property === "string"
                    ? null
                    : (booking.property as PropertyDTO);
                const tenant =
                  typeof booking.tenant === "string"
                    ? null
                    : (booking.tenant as SafeUser);
                return (
                  <li
                    key={booking._id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {property?.title ?? "Property"}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {tenant?.name ?? "Tenant"} &middot;{" "}
                        <time dateTime={booking.moveInDate}>
                          {new Date(booking.moveInDate).toLocaleDateString("en-GH", {
                            day: "numeric",
                            month: "short",
                          })}
                        </time>
                      </p>
                    </div>
                    <StatusBadge status={booking.status} kind="booking" />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-5"
          aria-labelledby="recent-payments-heading"
        >
          <h2
            id="recent-payments-heading"
            className="text-base font-bold text-ink-900"
          >
            Recent payments received
          </h2>

          {stats.recentPayments.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">
              No payments received yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.recentPayments.map((payment) => {
                const property =
                  typeof payment.property === "string" ? null : payment.property;
                return (
                  <li
                    key={payment._id}
                    className="flex items-center justify-between gap-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {property?.title ?? "Property"}
                      </p>
                      <p className="truncate font-mono text-xs text-ink-500">
                        {payment.reference}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-brand-700">
                        {formatGHS(payment.splitBreakdown?.landlord ?? 0)}
                      </p>
                      <p className="text-xs text-ink-500">
                        of {formatGHS(payment.amount)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-ink-500">
            Amounts shown are your share after the {""}
            {stats.recentPayments[0]?.splitBreakdown?.commissionPercent ?? 10}%
            platform commission.
          </p>
        </section>
      </div>

      <p className="text-sm text-ink-500">
        Need to add another property?{" "}
        <Link
          href="/dashboard/landlord?tab=properties"
          className="font-semibold text-brand-700 hover:underline"
        >
          Go to My properties
        </Link>
        .
      </p>
    </div>
  );
}
