"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Building2, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { LoadingState } from "@/components/ui/States";
import { cn } from "@/lib/cn";

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Shown as a count pill, e.g. unread messages. */
  badge?: number;
}

/**
 * Shared dashboard chrome: a sidebar of sections plus a header.
 *
 * `variant="admin"` swaps in the dark administration styling; tenants and
 * landlords get the light marketplace styling.
 */
export function DashboardShell({
  title,
  subtitle,
  items,
  activeId,
  onSelect,
  variant = "light",
  ready,
  children,
}: {
  title: string;
  subtitle?: string;
  items: NavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  variant?: "light" | "admin";
  ready: boolean;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAdmin = variant === "admin";

  // The role guard is still resolving, or has decided to redirect.
  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Loading your dashboard" />
      </div>
    );
  }

  const activeLabel = items.find((item) => item.id === activeId)?.label ?? title;

  const sidebar = (
    <div
      className={cn(
        "flex h-full flex-col",
        isAdmin ? "bg-admin-900 text-slate-300" : "border-r border-slate-200 bg-white",
      )}
    >
      <div
        className={cn(
          "flex h-16 shrink-0 items-center gap-2 px-5",
          isAdmin ? "border-b border-admin-700" : "border-b border-slate-200",
        )}
      >
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg text-white",
              isAdmin ? "bg-brand-600" : "bg-brand-600",
            )}
          >
            <Building2 className="size-4.5" aria-hidden="true" />
          </span>
          <span className={isAdmin ? "text-white" : "text-ink-900"}>
            RentFinder
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3" aria-label={`${title} sections`}>
        <ul className="space-y-1">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item.id);
                    setSidebarOpen(false);
                  }}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? isAdmin
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-700"
                      : isAdmin
                        ? "text-slate-300 hover:bg-admin-800 hover:text-white"
                        : "text-ink-700 hover:bg-surface-sunken",
                  )}
                >
                  <item.icon className="size-4.5 shrink-0" aria-hidden="true" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        isActive
                          ? "bg-white/25 text-white"
                          : "bg-brand-600 text-white",
                      )}
                    >
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className={cn(
          "shrink-0 p-3",
          isAdmin ? "border-t border-admin-700" : "border-t border-slate-200",
        )}
      >
        <div className="flex items-center gap-2.5 px-2 py-2">
          <UserAvatar name={user.name} src={user.avatar} size="sm" />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "truncate text-sm font-semibold",
                isAdmin ? "text-white" : "text-ink-900",
              )}
            >
              {user.name}
            </p>
            <p className="truncate text-xs text-ink-500 capitalize">{user.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className={cn(
            "mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            isAdmin
              ? "text-slate-300 hover:bg-admin-800 hover:text-white"
              : "text-ink-700 hover:bg-surface-sunken",
          )}
        >
          <LogOut className="size-4.5" aria-hidden="true" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-surface-muted">
      {/* Persistent sidebar from lg upwards. */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 left-0 w-64">{sidebar}</div>
      </aside>

      {/* Off-canvas sidebar below lg. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-80 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-64">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-ink-700 transition-colors hover:bg-surface-sunken lg:hidden"
            aria-label="Open dashboard menu"
          >
            <Menu className="size-5.5" aria-hidden="true" />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold text-ink-900">
              {activeLabel}
            </h1>
            {subtitle && (
              <p className="truncate text-xs text-ink-500">{subtitle}</p>
            )}
          </div>

          <Link
            href="/"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-surface-sunken sm:block"
          >
            View site
          </Link>
        </header>

        <main
          id="main-content"
          className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"
          // Announce section changes to assistive tech.
          aria-live="polite"
        >
          {children}
        </main>
      </div>

      {sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="sr-only"
          aria-label="Close dashboard menu"
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Stat tile used across all three dashboards. */
export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "brand",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  tone?: "brand" | "amber" | "sky" | "red" | "slate";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    amber: "bg-amber-50 text-amber-700",
    sky: "bg-sky-50 text-sky-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-surface-sunken text-ink-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ink-500">{label}</p>
          <p className="mt-1.5 truncate text-2xl font-bold text-ink-900">
            {typeof value === "number" ? value.toLocaleString("en-GH") : value}
          </p>
          {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
        </div>
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl",
            tones[tone],
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );
}
