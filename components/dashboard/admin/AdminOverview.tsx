"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Building2,
  CalendarCheck,
  Coins,
  CreditCard,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { StatTile } from "@/components/dashboard/DashboardShell";
import { RoleBadge, StatusBadge, VerifiedBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { LoadingState } from "@/components/ui/States";
import { formatGHS } from "@/lib/money";
import type { AdminStats } from "./AdminDashboard";

export function AdminOverview({
  stats,
  onNavigate,
}: {
  stats: AdminStats | null;
  onNavigate: (tab: string) => void;
}) {
  if (!stats) return <LoadingState label="Loading platform statistics" />;

  return (
    <div className="space-y-6">
      <section aria-labelledby="platform-heading">
        <h2 id="platform-heading" className="sr-only">
          Platform statistics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile icon={Users} label="Total users" value={stats.users.total} />
          <StatTile
            icon={UserCheck}
            label="Tenants"
            value={stats.users.tenants}
            tone="sky"
          />
          <StatTile
            icon={Building2}
            label="Landlords"
            value={stats.users.landlords}
            tone="sky"
          />
          <StatTile
            icon={Building2}
            label="Properties"
            value={stats.properties.total}
            hint={`${stats.properties.verified} verified`}
          />
          <StatTile
            icon={BadgeCheck}
            label="Pending verifications"
            value={
              stats.properties.pendingVerification +
              stats.verifications.pendingLandlords
            }
            hint={`${stats.verifications.pendingLandlords} landlords, ${stats.properties.pendingVerification} listings`}
            tone="amber"
          />
          <StatTile
            icon={CalendarCheck}
            label="Bookings"
            value={stats.bookings.total}
            hint={`${stats.bookings.confirmed} confirmed, ${stats.bookings.pending} pending`}
          />
          <StatTile
            icon={CreditCard}
            label="Payment volume"
            value={formatGHS(stats.payments.grossVolume)}
            hint={`${stats.payments.settled} settled payments`}
          />
          <StatTile
            icon={Coins}
            label="Platform commission"
            value={formatGHS(stats.payments.platformCommission)}
            hint={`${formatGHS(stats.payments.landlordPayouts)} paid to landlords`}
          />
        </div>
      </section>

      {stats.users.suspended > 0 && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
        >
          <p className="text-sm text-amber-900">
            <strong>{stats.users.suspended}</strong> account
            {stats.users.suspended === 1 ? " is" : "s are"} currently suspended.
          </p>
          <Button variant="outline" size="sm" onClick={() => onNavigate("users")}>
            Review
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section
          className="rounded-2xl border border-slate-200 bg-white p-5"
          aria-labelledby="recent-users-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-users-heading" className="text-base font-bold text-ink-900">
              Recent users
            </h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("users")}>
              Manage
            </Button>
          </div>

          {stats.recentUsers.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No users found.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.recentUsers.map((user) => (
                <li
                  key={user._id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-ink-500">{user.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <RoleBadge role={user.role} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          className="rounded-2xl border border-slate-200 bg-white p-5"
          aria-labelledby="recent-properties-heading"
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="recent-properties-heading"
              className="text-base font-bold text-ink-900"
            >
              Recent properties
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("properties")}
            >
              Manage
            </Button>
          </div>

          {stats.recentProperties.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No properties found.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {stats.recentProperties.map((property) => (
                <li
                  key={property._id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/properties/${property._id}`}
                      className="truncate text-sm font-medium text-ink-900 hover:text-brand-700 hover:underline"
                    >
                      {property.title}
                    </Link>
                    <p className="truncate text-xs text-ink-500">
                      {property.location.city} &middot; {formatGHS(property.price)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <VerifiedBadge verified={property.verified} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section
        className="rounded-2xl border border-slate-200 bg-white p-5"
        aria-labelledby="recent-transactions-heading"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id="recent-transactions-heading"
            className="flex items-center gap-2 text-base font-bold text-ink-900"
          >
            <Wallet className="size-5 text-ink-500" aria-hidden="true" />
            Recent transactions
          </h2>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("payments")}>
            View all
          </Button>
        </div>

        {stats.recentPayments.length === 0 ? (
          <p className="mt-4 text-sm text-ink-500">No transactions yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {stats.recentPayments.map((payment) => (
              <li
                key={payment._id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {typeof payment.property === "string"
                      ? "Property"
                      : payment.property.title}
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
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
