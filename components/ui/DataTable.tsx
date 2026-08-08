"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Hides lower-priority columns on small screens. */
  hideBelow?: "sm" | "md" | "lg";
  align?: "left" | "right";
}

const HIDE_CLASSES = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

/**
 * Dashboard table. Scrolls horizontally rather than squashing on narrow
 * viewports, and uses a real `<caption>` so the table is self-describing.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "Nothing to show yet.",
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "table-scroll rounded-2xl border border-slate-200 bg-white",
        className,
      )}
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-surface-muted">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-4 py-3 text-xs font-semibold tracking-wide text-ink-500 uppercase",
                  column.align === "right" && "text-right",
                  column.hideBelow && HIDE_CLASSES[column.hideBelow],
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-10 text-center text-sm text-ink-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-slate-100 transition-colors last:border-0 hover:bg-surface-muted"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3.5 align-middle text-ink-700",
                      column.align === "right" && "text-right",
                      column.hideBelow && HIDE_CLASSES[column.hideBelow],
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
