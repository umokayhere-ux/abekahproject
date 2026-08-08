"use client";

import type { ReactNode } from "react";
import { AlertCircle, Loader2, RefreshCw, type LucideIcon } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/cn";

/**
 * Loading / empty / error states. Every database-driven view renders one of
 * these instead of an ambiguous blank area.
 */

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-ink-500",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-7 animate-spin text-brand-600" aria-hidden="true" />
      <p className="text-sm font-medium">{label}…</p>
    </div>
  );
}

/** Skeleton grid used while property cards load, to avoid layout jump. */
export function CardSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white"
        >
          <div className="h-48 animate-pulse bg-surface-sunken" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-surface-sunken" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-sunken" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-surface-sunken" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-surface-muted px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-white text-ink-500 shadow-sm">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="mb-4 flex size-12 items-center justify-center rounded-full bg-white text-red-600 shadow-sm">
        <AlertCircle className="size-6" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold text-red-900">{title}</h3>
      {message && (
        <p className="mt-1.5 max-w-md text-sm text-red-700">{message}</p>
      )}
      {onRetry && (
        <div className="mt-5">
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
