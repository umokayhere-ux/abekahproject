"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";

export function ForgotPasswordForm() {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFieldErrors({});

    try {
      await apiFetch("/api/auth/forgot-password", {
        method: "POST",
        body: { email },
      });
      // The server responds identically whether or not the account exists, so
      // the UI must not imply anything either way.
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError) {
        setFieldErrors(error.errors ?? {});
        toast.error(error.message);
      } else {
        toast.error("Could not send the reset link. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold text-ink-900">Check your email</h1>
        <p className="mt-2 text-sm text-ink-500">
          If an account exists for <strong>{email}</strong>, we have sent a
          password reset link. It can be used once and expires in 60 minutes.
        </p>
        <p className="mt-6">
          <Link
            href="/auth/login"
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Forgot your password?</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Enter your email address and we will send you a link to choose a new one.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          type="email"
          label="Email address"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button type="submit" fullWidth size="lg" loading={submitting}>
          Send reset link
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Remembered it?{" "}
        <Link href="/auth/login" className="font-semibold text-brand-700 hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
