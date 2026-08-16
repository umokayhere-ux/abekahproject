"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { ButtonLink } from "@/components/ui/Button";
import { useApiResource } from "@/hooks/useApiResource";
import { formatGHS } from "@/lib/money";
import { describePayment } from "@/lib/payment-label";
import type { Paginated, PaymentDTO } from "@/types";

/** The signed-in user's payment history. Works for tenants and landlords. */
export function PaymentHistory({
  perspective = "tenant",
}: {
  perspective?: "tenant" | "landlord";
}) {
  const [page, setPage] = useState(1);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<Paginated<PaymentDTO>>(
    `/api/payments?page=${page}&limit=20`,
    { fallbackMessage: "Could not load payments" },
  );

  if (loading && !data) return <LoadingState label="Loading payments" />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (data && data.items.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="No payment history"
        description={
          perspective === "landlord"
            ? "Payments from your tenants will appear here once they settle."
            : "Once you pay for a booking, the receipt will appear here."
        }
        action={
          perspective === "tenant" ? (
            <ButtonLink href="/properties">Browse rentals</ButtonLink>
          ) : undefined
        }
      />
    );
  }

  const columns: Column<PaymentDTO>[] = [
    {
      key: "property",
      header: "Property",
      render: (payment) => (
        <span className="font-medium text-ink-900">
          {describePayment(payment)}
        </span>
      ),
    },
    {
      key: "amount",
      header: perspective === "landlord" ? "You receive" : "Amount",
      render: (payment) => (
        <span className="font-semibold text-ink-900">
          {formatGHS(
            perspective === "landlord"
              ? (payment.splitBreakdown?.landlord ?? payment.amount)
              : payment.amount,
          )}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      hideBelow: "md",
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
      key: "reference",
      header: "Reference",
      hideBelow: "lg",
      render: (payment) => (
        <span className="font-mono text-xs text-ink-500">{payment.reference}</span>
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
    <div className="space-y-6">
      <DataTable
        caption="Your payment history"
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(payment) => payment._id}
        emptyMessage="No payment history."
      />

      {data && data.totalPages > 1 && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
