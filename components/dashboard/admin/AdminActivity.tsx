"use client";

import { useState } from "react";
import { Activity, Search } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { BareSelect } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useApiResource } from "@/hooks/useApiResource";
import type { ActivityDTO, Paginated } from "@/types";

interface ActivityResponse extends Paginated<ActivityDTO> {
  actions: string[];
}

/** Human-readable label for a dotted action name, e.g. "auth.login". */
function humanizeAction(action: string): string {
  const [group, ...rest] = action.split(".");
  const verb = rest.join(".").replace(/_/g, " ");
  return `${group}: ${verb}`;
}

/** The audit trail. Sensitive values are stripped before they are ever stored. */
export function AdminActivity() {
  const [action, setAction] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const {
    data,
    loading,
    error,
    refetch: load,
  } = useApiResource<ActivityResponse>(
    `/api/admin/activity?action=${encodeURIComponent(action)}&q=${encodeURIComponent(query)}&page=${page}&limit=30`,
    { debounce: 300, fallbackMessage: "Could not load the activity log" },
  );

  const columns: Column<ActivityDTO>[] = [
    {
      key: "action",
      header: "Action",
      render: (entry) => (
        <Badge tone={entry.action.startsWith("admin.") ? "danger" : "neutral"}>
          {humanizeAction(entry.action)}
        </Badge>
      ),
    },
    {
      key: "message",
      header: "Details",
      render: (entry) => (
        <span className="text-ink-700">{entry.message ?? "—"}</span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      hideBelow: "md",
      render: (entry) => (
        <div className="min-w-0">
          <p className="truncate text-ink-900">{entry.actorEmail ?? "System"}</p>
          {entry.actorRole && (
            <p className="text-xs text-ink-500 capitalize">{entry.actorRole}</p>
          )}
        </div>
      ),
    },
    {
      key: "ip",
      header: "IP",
      hideBelow: "lg",
      render: (entry) => (
        <span className="font-mono text-xs text-ink-500">{entry.ip ?? "—"}</span>
      ),
    },
    {
      key: "when",
      header: "When",
      align: "right",
      render: (entry) =>
        entry.createdAt ? (
          <time dateTime={entry.createdAt} className="text-xs text-ink-500">
            {new Date(entry.createdAt).toLocaleString("en-GH", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink-900">
          <Activity className="size-5 text-ink-500" aria-hidden="true" />
          Activity log
        </h2>

        <div className="flex w-full flex-wrap gap-3 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
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
              placeholder="Search the log"
              aria-label="Search the activity log"
              className="h-11 w-full rounded-xl border border-slate-300 pr-3.5 pl-9 text-sm focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none"
            />
          </div>
          <BareSelect
            label="Filter by action"
            placeholder="All actions"
            options={(data?.actions ?? []).map((value) => ({
              value,
              label: humanizeAction(value),
            }))}
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {loading && !data ? (
        <LoadingState label="Loading activity" />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (
        <>
          <DataTable
            caption="Platform audit trail"
            columns={columns}
            rows={data?.items ?? []}
            rowKey={(entry) => entry._id}
            emptyMessage="No activity recorded yet."
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

      <p className="text-xs text-ink-500">
        Passwords, tokens, and payment credentials are never written to this log.
      </p>
    </div>
  );
}
