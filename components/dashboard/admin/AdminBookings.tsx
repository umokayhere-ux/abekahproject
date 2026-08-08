"use client";

import { useState } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { BareSelect } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useApiResource } from "@/hooks/useApiResource";
import { formatGHS } from "@/lib/money";
import type { BookingDTO, Paginated, PropertyDTO, SafeUser } from "@/types";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
];

/** Read-only platform-wide booking monitor. */
export function AdminBookings() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<Paginated<BookingDTO>>(
    `/api/admin/bookings?status=${status}&page=${page}&limit=15`,
    { fallbackMessage: "Could not load bookings" },
  );

  const columns: Column<BookingDTO>[] = [
    {
      key: "property",
      header: "Property",
      render: (booking) => {
        const property =
          typeof booking.property === "string" ? null : (booking.property as PropertyDTO);
        return property ? (
          <Link
            href={`/properties/${property._id}`}
            className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
          >
            {property.title}
          </Link>
        ) : (
          <span className="text-ink-500">Removed property</span>
        );
      },
    },
    {
      key: "tenant",
      header: "Tenant",
      hideBelow: "sm",
      render: (booking) =>
        typeof booking.tenant === "string" ? "—" : (booking.tenant as SafeUser).name,
    },
    {
      key: "landlord",
      header: "Landlord",
      hideBelow: "lg",
      render: (booking) =>
        typeof booking.landlord === "string"
          ? "—"
          : (booking.landlord as SafeUser).name,
    },
    {
      key: "moveIn",
      header: "Move-in",
      hideBelow: "md",
      render: (booking) => (
        <time dateTime={booking.moveInDate} className="text-ink-500">
          {new Date(booking.moveInDate).toLocaleDateString("en-GH", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </time>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      hideBelow: "lg",
      render: (booking) => formatGHS(booking.amount ?? 0),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (booking) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <StatusBadge status={booking.status} kind="booking" />
          <StatusBadge status={booking.paymentStatus ?? "unpaid"} kind="payment" />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">Bookings</h2>
        <BareSelect
          label="Filter by status"
          placeholder="All statuses"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        />
      </div>

      {loading && !data ? (
        <LoadingState label="Loading bookings" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            caption="All bookings on the platform"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(booking) => booking._id}
            emptyMessage="No bookings yet."
          />
          {data && data.totalPages > 1 && (
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
