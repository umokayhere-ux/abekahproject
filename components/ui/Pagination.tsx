"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Builds a compact page list with ellipses, e.g. 1 … 4 [5] 6 … 20.
 * `-1` marks a gap.
 */
function pageWindow(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);

  const sorted = [...pages].sort((a, b) => a - b);
  const withGaps: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i]! - sorted[i - 1]! > 1) withGaps.push(-1);
    withGaps.push(sorted[i]!);
  }
  return withGaps;
}

export function Pagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  const pages = pageWindow(page, totalPages);
  const buttonBase =
    "inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <nav
      className={cn("flex items-center justify-center gap-1.5", className)}
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={cn(buttonBase, "border-slate-300 bg-white hover:bg-surface-muted")}
        aria-label="Go to previous page"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        <span className="hidden sm:ml-1 sm:inline">Previous</span>
      </button>

      {pages.map((entry, index) =>
        entry === -1 ? (
          <span
            key={`gap-${index}`}
            className="px-1.5 text-sm text-ink-500"
            aria-hidden="true"
          >
            &hellip;
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onPageChange(entry)}
            aria-current={entry === page ? "page" : undefined}
            aria-label={`Go to page ${entry}`}
            className={cn(
              buttonBase,
              entry === page
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-300 bg-white hover:bg-surface-muted",
            )}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(buttonBase, "border-slate-300 bg-white hover:bg-surface-muted")}
        aria-label="Go to next page"
      >
        <span className="hidden sm:mr-1 sm:inline">Next</span>
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
