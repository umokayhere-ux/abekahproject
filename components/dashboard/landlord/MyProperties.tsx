"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, Eye, ImageOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmationModal } from "@/components/ui/Modal";
import { StatusBadge, VerifiedBadge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { useApiResource } from "@/hooks/useApiResource";
import { formatRent } from "@/lib/money";
import { PropertyForm } from "./PropertyForm";
import type { Paginated, PropertyDTO } from "@/types";

/** The landlord's own listings, with full create/edit/delete. */
export function MyProperties({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
  const toast = useToast();

  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PropertyDTO | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<PropertyDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Scoped to this landlord; the server also enforces ownership on writes.
  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<Paginated<PropertyDTO>>(
    user ? `/api/properties?landlord=${user._id}&page=${page}&limit=9` : null,
    { fallbackMessage: "Could not load your properties" },
  );

  const handleSaved = () => {
    setFormOpen(false);
    setEditing(undefined);
    load();
    onChanged();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/properties/${deleteTarget._id}`, { method: "DELETE" });
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

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (property: PropertyDTO) => {
    setEditing(property);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">My properties</h2>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Add property
        </Button>
      </div>

      {loading && !data ? (
        <LoadingState label="Loading your properties" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No properties yet"
          description="Add your first listing to start receiving booking requests from tenants across Ghana."
          action={
            <Button onClick={openCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Add your first property
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((property) => (
            <li
              key={property._id}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="relative h-40 bg-surface-sunken">
                {property.images[0] ? (
                  <Image
                    src={property.images[0]}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-500">
                    <ImageOff className="size-7" aria-hidden="true" />
                  </div>
                )}
                <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                  <VerifiedBadge verified={property.verified} />
                  <StatusBadge status={property.status} kind="property" />
                </div>
              </div>

              <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-1 font-semibold text-ink-900">
                  {property.title}
                </h3>
                <p className="mt-0.5 line-clamp-1 text-sm text-ink-500">
                  {property.location.city}, {property.location.state}
                </p>

                <div className="mt-2 flex items-center justify-between">
                  <p className="font-bold text-brand-700">
                    {formatRent(property.price)}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-ink-500">
                    <Eye className="size-3.5" aria-hidden="true" />
                    {property.views ?? 0} views
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link
                    href={`/properties/${property._id}`}
                    className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-muted"
                  >
                    View
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(property)}
                  >
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(property)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.totalPages > 1 && (
        <Pagination
          page={data.page}
          totalPages={data.totalPages}
          onPageChange={setPage}
        />
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit property" : "Add a property"}
        description={
          editing
            ? "Update the details of your listing."
            : "New listings are reviewed by our team before they are marked verified."
        }
        size="lg"
      >
        <PropertyForm
          property={editing}
          onSaved={handleSaved}
          onCancel={() => setFormOpen(false)}
        />
      </Modal>

      <ConfirmationModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        destructive
        title="Delete this property?"
        description={`"${deleteTarget?.title ?? ""}" will be permanently removed, along with its reviews and any pending bookings. This cannot be undone.`}
        confirmLabel="Delete property"
      />
    </div>
  );
}
