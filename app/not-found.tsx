import Link from "next/link";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
    >
      <p className="text-6xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-2xl font-bold text-ink-900">Page not found</h1>
      <p className="mt-2 max-w-md text-ink-500">
        The page you are looking for does not exist, or the property may have
        been removed by its landlord.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <Home className="size-4" aria-hidden="true" />
          Go home
        </Link>
        <Link
          href="/properties"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-300 px-5 font-semibold text-ink-900 transition-colors hover:bg-surface-muted"
        >
          <Search className="size-4" aria-hidden="true" />
          Browse rentals
        </Link>
      </div>
    </main>
  );
}
