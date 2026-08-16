"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAuth, dashboardPathFor } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { openPaystackCheckout } from "@/lib/paystack-popup";
import { formatGHS } from "@/lib/money";
import { cn } from "@/lib/cn";

type PublicRole = "tenant" | "landlord";

const ROLE_CHOICES: {
  value: PublicRole;
  label: string;
  description: string;
  icon: typeof User;
}[] = [
  {
    value: "tenant",
    label: "I'm looking for a home",
    description: "Search, save, book, and pay rent.",
    icon: User,
  },
  {
    value: "landlord",
    label: "I have a property to rent",
    description: "List properties and receive payments.",
    icon: Building2,
  },
];

export function RegisterForm() {
  const { register, user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  // Deep links such as /auth/register?role=landlord preselect the account type.
  const initialRole: PublicRole =
    searchParams.get("role") === "landlord" ? "landlord" : "tenant";

  const [role, setRole] = useState<PublicRole>(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Read from the server so the stated amount cannot drift from what is charged.
  const [fee, setFee] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace(dashboardPathFor(user.role));
  }, [user, loading, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      apiFetch<{ landlordRegistrationFee: number }>("/api/config")
        .then((config) => setFee(config.landlordRegistrationFee))
        // The exact figure is a nicety; Paystack shows the real amount.
        .catch(() => undefined);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const result = await register({
        name,
        email,
        password,
        phone: phone || undefined,
        role,
      });

      // A landlord has no account until the listing fee is paid, so the only
      // thing to do here is open checkout.
      if (result.requiresPayment) {
        const handled = await openPaystackCheckout({
          accessCode: result.accessCode,
          authorizationUrl: result.authorizationUrl,
          onSuccess: () => {
            // The account is created by the server once the charge settles;
            // this page just waits for it.
            router.replace(
              `/auth/registration-complete?reference=${result.reference}`,
            );
          },
          onCancel: () => {
            setSubmitting(false);
            setFormError(
              "Payment was cancelled, so your account was not created. You can try again.",
            );
          },
        });

        // A redirect leaves the page; keep the button busy until it does.
        if (handled === "popup") return;
        return;
      }

      toast.success(`Welcome to RentFinder, ${result.user.name}`);
      router.replace(dashboardPathFor(result.user.role));
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        setFieldErrors(error.errors ?? {});
      } else {
        setFormError("We could not create your account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900">Create your account</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Join RentFinder to rent a home or list your property.
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
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink-700">
            What brings you here?
          </legend>
          <div className="grid grid-cols-1 gap-2.5">
            {ROLE_CHOICES.map((choice) => (
              <label
                key={choice.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors",
                  role === choice.value
                    ? "border-brand-600 bg-brand-50"
                    : "border-slate-300 hover:bg-surface-muted",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={choice.value}
                  checked={role === choice.value}
                  onChange={() => setRole(choice.value)}
                  className="mt-1 size-4 accent-brand-600"
                />
                <choice.icon
                  className="mt-0.5 size-5 shrink-0 text-brand-700"
                  aria-hidden="true"
                />
                <span>
                  <span className="block text-sm font-semibold text-ink-900">
                    {choice.label}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {choice.description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Input
          label="Full name"
          required
          autoComplete="name"
          placeholder="Ama Mensah"
          value={name}
          error={fieldErrors.name}
          onChange={(event) => setName(event.target.value)}
        />

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

        <Input
          type="tel"
          label="Phone number"
          autoComplete="tel"
          placeholder="0244123456"
          hint="Optional. Ghanaian format, e.g. 0244123456 or +233244123456."
          value={phone}
          error={fieldErrors.phone}
          onChange={(event) => setPhone(event.target.value)}
        />

        <Input
          type="password"
          label="Password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          hint="Use at least 8 characters, including a letter and a number."
          value={password}
          error={fieldErrors.password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {role === "landlord" && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
            <p className="font-semibold text-brand-900">
              One-off listing fee{fee !== null ? `: ${formatGHS(fee)}` : ""}
            </p>
            <p className="mt-1 text-brand-800">
              Paystack opens when you continue. Your account is created once the
              payment goes through — nothing is charged if you cancel.
            </p>
          </div>
        )}

        <Button type="submit" fullWidth size="lg" loading={submitting}>
          {role === "landlord" ? "Continue to payment" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-500">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="font-semibold text-brand-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
