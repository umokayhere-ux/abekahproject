"use client";

import { useState } from "react";
import { Coins, Search, Wallet } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { BareSelect } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/Badge";
import { StatTile } from "@/components/dashboard/DashboardShell";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useApiResource } from "@/hooks/useApiResource";
import { formatGHS } from "@/lib/money";
import type { Paginated, PaymentDTO, SafeUser } from "@/types";

interface PaymentsResponse extends Paginated<PaymentDTO> {
  totals: {
    grossVolume: number;
    platformCommission: number;
    landlordPayouts: number;
  };
}

const STATUS_OPTIONS = [
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
];

/** Transaction ledger with the commission split made explicit. */
export function AdminPayments() {
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<PaymentsResponse>(
    `/api/admin/payments?status=${status}&q=${encodeURIComponent(query)}&page=${page}&limit=15`,
    // Debounced so typing a reference does not fire a request per keystroke.
    { debounce: 300, fallbackMessage: "Could not load payments" },
  );

  const columns: Column<PaymentDTO>[] = [
    {
      key: "reference",
      header: "Reference",
      render: (payment) => (
        <div className="min-w-0">
          <p className="font-mono text-xs text-ink-900">{payment.reference}</p>
          <p className="truncate text-xs text-ink-500">
            {typeof payment.property === "string"
              ? "Property"
              : payment.property.title}
          </p>
        </div>
      ),
    },
    {
      key: "tenant",
      header: "Tenant",
      hideBelow: "md",
      render: (payment) =>
        typeof payment.tenant === "string" ? "—" : (payment.tenant as SafeUser).name,
    },
    {
      key: "landlord",
      header: "Landlord",
      hideBelow: "lg",
      render: (payment) =>
        typeof payment.landlord === "string"
          ? "—"
          : (payment.landlord as SafeUser).name,
    },
    {
      key: "amount",
      header: "Amount",
      render: (payment) => (
        <span className="font-semibold text-ink-900">
          {formatGHS(payment.amount)}
          <span className="ml-1 text-xs font-normal text-ink-500">
            {payment.currency}
          </span>
        </span>
      ),
    },
    {
      key: "commission",
      header: "Commission",
      hideBelow: "sm",
      render: (payment) => (
        <div className="text-xs">
          <p className="text-ink-900">
            Platform {formatGHS(payment.splitBreakdown?.platform ?? 0)}
          </p>
          <p className="text-ink-500">
            Landlord {formatGHS(payment.splitBreakdown?.landlord ?? 0)}
          </p>
        </div>
      ),
    },
    {
      key: "date",
      header: "Date",
      hideBelow: "lg",
      render: (payment) =>
        payment.createdAt ? (
          <time dateTime={payment.createdAt} className="text-ink-500">
            {new Date(payment.createdAt).toLocaleDateString("en-GH", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </time>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      header: "Status",
      align: "right",
      render: (payment) => <StatusBadge status={payment.status} kind="payment" />,
    },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-ink-900">Payments</h2>

      {data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatTile
            icon={Wallet}
            label="Gross volume"
            value={formatGHS(data.totals.grossVolume)}
          />
          <StatTile
            icon={Coins}
            label="Platform commission"
            value={formatGHS(data.totals.platformCommission)}
            tone="amber"
          />
          <StatTile
            icon={Wallet}
            label="Paid to landlords"
            value={formatGHS(data.totals.landlordPayouts)}
            tone="sky"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
          <Search
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Search by reference"
            aria-label="Search payments by reference"
            className="h-11 w-full rounded-xl border border-slate-300 pr-3.5 pl-9 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
          />
        </div>
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
        <LoadingState label="Loading payments" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            caption="All payments processed by the platform"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(payment) => payment._id}
            emptyMessage="No payments recorded yet."
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
