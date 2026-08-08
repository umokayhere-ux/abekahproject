"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Toast notifications.
 *
 * Rendered into an `aria-live` region so the message is announced without
 * stealing focus. Errors use `assertive`; everything else is `polite`.
 */

type ToastKind = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 5000;

const STYLES: Record<ToastKind, { wrap: string; icon: ReactNode }> = {
  success: {
    wrap: "border-brand-200 bg-brand-50 text-brand-900",
    icon: <CheckCircle2 className="size-5 shrink-0 text-brand-600" aria-hidden="true" />,
  },
  error: {
    wrap: "border-red-200 bg-red-50 text-red-900",
    icon: <XCircle className="size-5 shrink-0 text-red-600" aria-hidden="true" />,
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50 text-amber-900",
    icon: (
      <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden="true" />
    ),
  },
  info: {
    wrap: "border-slate-200 bg-white text-ink-900",
    icon: <Info className="size-5 shrink-0 text-slate-500" aria-hidden="true" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      // Date.now() alone can collide when several toasts fire in one tick.
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, kind, message }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
      warning: (message) => push("warning", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.kind === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-3.5 shadow-lg",
              STYLES[toast.kind].wrap,
            )}
          >
            {STYLES[toast.kind].icon}
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-md p-0.5 text-current/60 transition-colors hover:text-current"
              aria-label="Dismiss notification"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}
