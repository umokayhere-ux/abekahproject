"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/client";

type Status = "checking" | "complete" | "pending" | "failed" | "unknown";

/** How long to keep polling before telling the landlord to check back. */
const MAX_ATTEMPTS = 10;
const POLL_MS = 3000;

/**
 * Where a landlord lands after paying the listing fee.
 *
 * The account is created server-side once the charge settles, which normally
 * happens via the webhook within a second or two. This page polls the status
 * endpoint rather than assuming success — the redirect back from Paystack is
 * not proof of payment.
 */
export function RegistrationComplete() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference");

  const [status, setStatus] = useState<Status>("checking");
  const [email, setEmail] = useState<string | undefined>();
  const [attempts, setAttempts] = useState(0);

  const check = useCallback(async () => {
    if (!reference) return;
    try {
      const result = await apiFetch<{ status: Status; email?: string }>(
        `/api/auth/registration-status?reference=${encodeURIComponent(reference)}`,
      );
      setEmail(result.email);
      setStatus(result.status);
    } catch {
      setStatus("pending");
    }
  }, [reference]);

  useEffect(() => {
    if (status === "complete" || status === "failed") return;
    if (attempts >= MAX_ATTEMPTS) return;

    // Every state change happens inside the timer callback, never synchronously
    // in the effect body, which would cascade an extra render.
    const timer = setTimeout(
      () => {
        if (!reference) {
          setStatus("unknown");
          return;
        }
        void check();
        setAttempts((count) => count + 1);
      },
      attempts === 0 ? 0 : POLL_MS,
    );

    return () => clearTimeout(timer);
  }, [attempts, check, reference, status]);

  if (status === "complete") {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold text-ink-900">
          Payment received — your account is ready
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {email ? (
            <>
              Sign in as <strong>{email}</strong> to add your first property.
            </>
          ) : (
            "Sign in to add your first property."
          )}
        </p>
        <div className="mt-6">
          <ButtonLink href="/auth/login" size="lg" fullWidth>
            Sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (status === "failed" || status === "unknown") {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold text-ink-900">
          {status === "failed"
            ? "That payment did not go through"
            : "We could not find that payment"}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          No account was created and you have not been charged. You can start
          again — nothing was saved.
        </p>
        <div className="mt-6">
          <ButtonLink href="/auth/register?role=landlord" size="lg" fullWidth>
            Try again
          </ButtonLink>
        </div>
      </div>
    );
  }

  const gaveUp = attempts >= MAX_ATTEMPTS;

  return (
    <div className="text-center">
      <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-sunken text-brand-600">
        <Loader2
          className={gaveUp ? "size-6" : "size-6 animate-spin"}
          aria-hidden="true"
        />
      </span>
      <h1 className="text-2xl font-bold text-ink-900">
        {gaveUp ? "Still processing" : "Confirming your payment"}
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        {gaveUp
          ? "Your payment is taking longer than usual to confirm. If it succeeded, your account will be ready shortly — try signing in in a few minutes."
          : "This usually takes a few seconds. Please do not close this page."}
      </p>

      {gaveUp && (
        <div className="mt-6 space-y-2">
          <Button
            fullWidth
            onClick={() => {
              setAttempts(0);
              setStatus("checking");
            }}
          >
            Check again
          </Button>
          <p className="text-sm text-ink-500">
            <Link href="/auth/login" className="font-semibold text-brand-700 hover:underline">
              Go to sign in
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
