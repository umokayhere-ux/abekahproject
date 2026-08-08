"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAuth, dashboardPathFor } from "@/hooks/useAuth";
import { ApiError } from "@/lib/client";

export function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Where to go after signing in: an explicit `next`, otherwise the role's home.
  const next = searchParams.get("next");

  // Someone already signed in has no business on the login page.
  useEffect(() => {
    if (!loading && user) {
      router.replace(next ?? dashboardPathFor(user.role));
    }
  }, [user, loading, next, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const signedIn = await login(email, password);
      toast.success(`Welcome back, ${signedIn.name}`);
      router.replace(next ?? dashboardPathFor(signedIn.role));
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setFieldErrors(error.errors ?? {});
      } else {
        setFormError("We could not sign you in. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Welcome back</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Sign in to manage your rentals, bookings, and payments.
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
          type="email"
          label="Email address"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          error={fieldErrors.email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <div>
          <Input
            type="password"
            label="Password"
            required
            autoComplete="current-password"
            placeholder="Your password"
            value={password}
            error={fieldErrors.password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className="mt-2 text-right">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              Forgot your password?
            </Link>
          </p>
        </div>

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        New to RentFinder?{" "}
        <Link
          href="/auth/register"
          className="font-semibold text-brand-700 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
