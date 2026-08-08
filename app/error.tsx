"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

/**
 * Root error boundary. The raw error is logged to the console rather than
 * rendered, so no stack trace reaches the user.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <main
      id="main-content"
      className="flex min-h-screen flex-col items-center justify-center px-4 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600">
        <AlertCircle className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-ink-900">Something went wrong</h1>
      <p className="mt-2 max-w-md text-ink-500">
        We hit an unexpected problem. Try again, and if it keeps happening
        please contact support.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-ink-500">
          Reference: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 font-semibold text-white transition-colors hover:bg-brand-700"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Try again
      </button>
    </main>
  );
}
