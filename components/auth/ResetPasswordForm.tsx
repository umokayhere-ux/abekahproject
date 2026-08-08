"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const toast = useToast();

  // Both values arrive in the emailed link.
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const linkIsUsable = Boolean(token && email);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (password !== confirm) {
      setFieldErrors({ confirm: "Both passwords must match" });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      await apiFetch("/api/auth/reset-password", {
        method: "POST",
        body: { email, token, password },
      });
      toast.success("Your password has been updated. Please sign in.");
      router.replace("/auth/login");
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setFieldErrors(error.errors ?? {});
      } else {
        setFormError("Could not reset your password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!linkIsUsable) {
    return (
      <div className="text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <AlertCircle className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold text-ink-900">This link is incomplete</h1>
        <p className="mt-2 text-sm text-ink-500">
          Open the reset link directly from your email, or request a new one.
        </p>
        <p className="mt-6">
          <Link
            href="/auth/forgot-password"
            className="text-sm font-semibold text-brand-700 hover:underline"
          >
            Request a new reset link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Choose a new password</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Setting a new password for <strong>{email}</strong>.
        </p>
      </header>

      {formError && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-800"
        >
          <AlertCircle className="mt-0.5 size-4.5 shrink-0" aria-hidden="true" />
          <p>{formError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          type="password"
          label="New password"
          required
          autoComplete="new-password"
          hint="Use at least 8 characters, including a letter and a number."
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <Input
          type="password"
          label="Confirm new password"
          required
          autoComplete="new-password"
          value={confirm}
          error={fieldErrors.confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <Button type="submit" fullWidth size="lg" loading={submitting}>
          Update password
        </Button>
      </form>
    </>
  );
}
