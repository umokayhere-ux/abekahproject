"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  X,
} from "lucide-react";
import { useAuth, dashboardPathFor } from "@/hooks/useAuth";
import { Button, ButtonLink } from "@/components/ui/Button";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { cn } from "@/lib/cn";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/properties", label: "Browse rentals" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Navbar() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <nav
        className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"
        aria-label="Main"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-bold text-ink-900"
          onClick={closeMenu}
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Building2 className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg">RentFinder</span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  pathname === link.href
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink-700 hover:bg-surface-sunken",
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 lg:flex">
          {loading ? (
            // Reserve the space so the header does not jump once auth resolves.
            <div className="h-11 w-40 animate-pulse rounded-xl bg-surface-sunken" />
          ) : user ? (
            <>
              <ButtonLink href={dashboardPathFor(user.role)} variant="outline">
                <LayoutDashboard className="size-4" aria-hidden="true" />
                Dashboard
              </ButtonLink>
              <div className="flex items-center gap-2 pl-1">
                <UserAvatar name={user.name} src={user.avatar} size="sm" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={logout}
                  aria-label={`Sign out of ${user.name}'s account`}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </Button>
              </div>
            </>
          ) : (
            <>
              <ButtonLink href="/auth/login" variant="ghost">
                Sign in
              </ButtonLink>
              <ButtonLink href="/auth/register">Get started</ButtonLink>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="rounded-lg p-2 text-ink-700 transition-colors hover:bg-surface-sunken lg:hidden"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
        >
          {menuOpen ? (
            <X className="size-6" aria-hidden="true" />
          ) : (
            <Menu className="size-6" aria-hidden="true" />
          )}
        </button>
      </nav>

      {menuOpen && (
        <div
          id="mobile-menu"
          className="border-t border-slate-200 bg-white px-4 py-4 lg:hidden"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={closeMenu}
                  aria-current={pathname === link.href ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 text-sm font-medium",
                    pathname === link.href
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-700 hover:bg-surface-sunken",
                  )}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-4 space-y-2 border-t border-slate-200 pt-4">
            {user ? (
              <>
                <div className="flex items-center gap-3 px-1 pb-2">
                  <UserAvatar name={user.name} src={user.avatar} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink-900">
                      {user.name}
                    </p>
                    <p className="truncate text-xs text-ink-500">{user.email}</p>
                  </div>
                </div>
                <ButtonLink
                  href={dashboardPathFor(user.role)}
                  variant="outline"
                  fullWidth
                >
                  <LayoutDashboard className="size-4" aria-hidden="true" />
                  Dashboard
                </ButtonLink>
                <Button
                  variant="ghost"
                  fullWidth
                  onClick={() => {
                    closeMenu();
                    void logout();
                  }}
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <ButtonLink href="/properties" variant="outline" fullWidth>
                  <Search className="size-4" aria-hidden="true" />
                  Browse rentals
                </ButtonLink>
                <ButtonLink href="/auth/login" variant="ghost" fullWidth>
                  Sign in
                </ButtonLink>
                <ButtonLink href="/auth/register" fullWidth>
                  Get started
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
