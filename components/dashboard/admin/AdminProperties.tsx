"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Search, ShieldOff, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/Modal";
import { StatusBadge, VerifiedBadge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import { useApiResource } from "@/hooks/useApiResource";
import { formatGHS } from "@/lib/money";
import type { Paginated, PropertyDTO, SafeUser } from "@/types";

/** Admin property management: search, verify, unverify, delete. */
export function AdminProperties({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PropertyDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<Paginated<PropertyDTO>>(
    `/api/admin/properties?q=${encodeURIComponent(query)}&page=${page}&limit=15`,
    // Debounced so typing in the search box does not fire a request per keypress.
    { debounce: 300, fallbackMessage: "Could not load properties" },
  );

  const toggleVerification = async (property: PropertyDTO) => {
    setBusyId(property._id);
    try {
      await apiFetch("/api/admin/properties", {
        method: "PATCH",
        body: {
          propertyId: property._id,
          action: property.verified ? "unverify" : "verify",
        },
      });
      toast.success(property.verified ? "Property unverified" : "Property verified");
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not update the property",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/properties?propertyId=${deleteTarget._id}`, {
        method: "DELETE",
      });
      toast.success("Property deleted");
      setDeleteTarget(null);
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not delete the property",
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<PropertyDTO>[] = [
    {
      key: "title",
      header: "Property",
      render: (property) => (
        <div className="min-w-0">
          <Link
            href={`/properties/${property._id}`}
            className="font-medium text-ink-900 hover:text-brand-700 hover:underline"
          >
            {property.title}
          </Link>
          <p className="text-xs text-ink-500">
            {property.location.city}, {property.location.state}
          </p>
        </div>
      ),
    },
    {
      key: "landlord",
      header: "Landlord",
      hideBelow: "lg",
      render: (property) => (
        <span className="text-ink-700">
          {typeof property.landlord === "string"
            ? "—"
            : (property.landlord as SafeUser).name}
        </span>
      ),
    },
    {
      key: "price",
      header: "Rent",
      hideBelow: "sm",
      render: (property) => (
        <span className="font-medium">{formatGHS(property.price)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "md",
      render: (property) => (
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge status={property.status} kind="property" />
          <VerifiedBadge verified={property.verified} />
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      render: (property) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={busyId === property._id}
            onClick={() => toggleVerification(property)}
          >
            {property.verified ? (
              <>
                <ShieldOff className="size-3.5" aria-hidden="true" />
                Unverify
              </>
            ) : (
              <>
                <BadgeCheck className="size-3.5" aria-hidden="true" />
                Verify
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-red-600 hover:bg-red-50"
            onClick={() => setDeleteTarget(property)}
            aria-label={`Delete ${property.title}`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">Properties</h2>
        <div className="relative w-full max-w-xs">
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
            placeholder="Search by title or city"
            aria-label="Search properties"
            className="h-11 w-full rounded-xl border border-slate-300 pr-3.5 pl-9 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
          />
        </div>
      </div>

      {loading && !data ? (
        <LoadingState label="Loading properties" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            caption="All properties on the platform"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(property) => property._id}
            emptyMessage="No properties found."
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

      <ConfirmationModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        destructive
        title="Delete this property?"
        description={`"${deleteTarget?.title ?? ""}" will be permanently removed, along with its bookings and reviews. This cannot be undone.`}
        confirmLabel="Delete property"
      />
    </div>
  );
}
