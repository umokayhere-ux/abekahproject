import Link from "next/link";
import { Building2 } from "lucide-react";

/** Centred, distraction-free shell for the authentication screens. */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-12"
    >
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-xl font-bold text-ink-900"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Building2 className="size-5.5" aria-hidden="true" />
        </span>
        RentFinder
      </Link>

      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        {children}
      </div>

      <p className="mt-6 text-center text-sm text-ink-500">
        <Link href="/" className="hover:text-brand-700 hover:underline">
          Back to RentFinder
        </Link>
      </p>
    </main>
  );
}
