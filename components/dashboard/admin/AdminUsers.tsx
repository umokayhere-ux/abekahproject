"use client";

import { useState } from "react";
import { BadgeCheck, Ban, Search, ShieldOff, Trash2, Undo2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/Button";
import { ConfirmationModal } from "@/components/ui/Modal";
import { BareSelect } from "@/components/ui/Field";
import { Badge, RoleBadge, VerifiedBadge } from "@/components/ui/Badge";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { useApiResource } from "@/hooks/useApiResource";
import type { Paginated, SafeUser } from "@/types";

const ROLE_OPTIONS = [
  { value: "tenant", label: "Tenants" },
  { value: "landlord", label: "Landlords" },
  { value: "admin", label: "Administrators" },
];

type UserAction = "verify" | "unverify" | "suspend" | "unsuspend";

/** Admin user management: search, filter, verify, suspend, delete. */
export function AdminUsers({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const { user: currentUser } = useAuth();

  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SafeUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<Paginated<SafeUser>>(
    `/api/admin/users?q=${encodeURIComponent(query)}&role=${role}&page=${page}&limit=15`,
    { debounce: 300, fallbackMessage: "Could not load users" },
  );

  const applyAction = async (user: SafeUser, action: UserAction) => {
    setBusyId(user._id);
    try {
      await apiFetch("/api/admin/users", {
        method: "PATCH",
        body: { userId: user._id, action },
      });
      toast.success(
        {
          verify: "User verified",
          unverify: "Verification removed",
          suspend: "User suspended",
          unsuspend: "User reinstated",
        }[action],
      );
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not update that user",
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/admin/users?userId=${deleteTarget._id}`, {
        method: "DELETE",
      });
      toast.success("User deleted");
      setDeleteTarget(null);
      load();
      onChanged();
    } catch (caught) {
      toast.error(
        caught instanceof ApiError ? caught.message : "Could not delete that user",
      );
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<SafeUser>[] = [
    {
      key: "user",
      header: "User",
      render: (user) => (
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={user.name} src={user.avatar} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      hideBelow: "sm",
      render: (user) => <RoleBadge role={user.role} />,
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "md",
      render: (user) => (
        <div className="flex flex-wrap gap-1.5">
          <VerifiedBadge verified={user.verified} />
          {user.suspended && <Badge tone="danger">Suspended</Badge>}
        </div>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      hideBelow: "lg",
      render: (user) =>
        user.createdAt ? (
          <time dateTime={user.createdAt} className="text-ink-500">
            {new Date(user.createdAt).toLocaleDateString("en-GH", {
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
      key: "actions",
      header: "Actions",
      align: "right",
      render: (user) => {
        // An admin cannot act destructively on their own account, and admin
        // accounts cannot be suspended or deleted from here at all.
        const isSelf = user._id === currentUser?._id;
        const isAdmin = user.role === "admin";

        return (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={busyId === user._id}
              disabled={isSelf && user.verified}
              onClick={() => applyAction(user, user.verified ? "unverify" : "verify")}
            >
              {user.verified ? (
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

            {!isAdmin && (
              <Button
                variant="outline"
                size="sm"
                loading={busyId === user._id}
                onClick={() =>
                  applyAction(user, user.suspended ? "unsuspend" : "suspend")
                }
              >
                {user.suspended ? (
                  <>
                    <Undo2 className="size-3.5" aria-hidden="true" />
                    Reinstate
                  </>
                ) : (
                  <>
                    <Ban className="size-3.5" aria-hidden="true" />
                    Suspend
                  </>
                )}
              </Button>
            )}

            {!isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-600 hover:bg-red-50"
                onClick={() => setDeleteTarget(user)}
                aria-label={`Delete ${user.name}`}
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink-900">Users</h2>
        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
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
              placeholder="Search name, email, phone"
              aria-label="Search users"
              className="h-11 w-full rounded-xl border border-slate-300 pr-3.5 pl-9 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
            />
          </div>
          <BareSelect
            label="Filter by role"
            placeholder="All roles"
            options={ROLE_OPTIONS}
            value={role}
            onChange={(event) => {
              setRole(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading && !data ? (
        <LoadingState label="Loading users" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            caption="All registered users"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(user) => user._id}
            emptyMessage="No users found."
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
        title="Delete this user?"
        description={`${deleteTarget?.name ?? "This user"} will be permanently removed, along with their properties, bookings, reviews, and conversations. Payment records are retained. This cannot be undone.`}
        confirmLabel="Delete user"
      />
    </div>
  );
}
