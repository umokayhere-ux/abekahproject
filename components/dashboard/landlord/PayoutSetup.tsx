"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Info, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { formatGHS } from "@/lib/money";
import type { SafeUser } from "@/types";

interface PayoutStatus {
  configured: boolean;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  landlordSharePercent: number;
  platformCommissionPercent: number;
  paystackConfigured: boolean;
}

interface Bank {
  name: string;
  code: string;
}

/**
 * Paystack payout setup.
 *
 * The bank list and the subaccount creation both run server-side; the secret
 * key never reaches the browser, and the full account number is never returned
 * once saved.
 */
export function PayoutSetup({ onConfigured }: { onConfigured: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [reloadNonce, setReloadNonce] = useState(0);
  const load = () => setReloadNonce((value) => value + 1);

  useEffect(() => {
    let cancelled = false;

    // Runs inside a timer callback, so no state is set synchronously here.
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const payoutStatus = await apiFetch<PayoutStatus>("/api/landlord/payout");
        if (cancelled) return;
        setStatus(payoutStatus);

        if (payoutStatus.paystackConfigured) {
          // The bank list is only useful when Paystack is actually configured.
          const data = await apiFetch<{ banks: Bank[] }>("/api/landlord/banks");
          if (!cancelled) setBanks(data.banks);
        }
      } catch (caught) {
        if (cancelled) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load your payout settings",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const timer = setTimeout(run, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reloadNonce]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    const bank = banks.find((entry) => entry.code === bankCode);
    if (!bank) {
      setErrors({ bankCode: "Choose your bank" });
      setSubmitting(false);
      return;
    }

    try {
      const result = await apiFetch<{
        accountName: string;
        user: SafeUser;
      }>("/api/landlord/payout", {
        method: "POST",
        body: { bankCode, bankName: bank.name, accountNumber },
      });

      setUser(result.user);
      toast.success(`Payout account connected for ${result.accountName}`);
      setAccountNumber("");
      load();
      onConfigured();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.errors ?? {});
        toast.error(caught.message);
      } else {
        toast.error("Could not save your payout details");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading payout settings" />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!status) return null;

  const exampleRent = 1000;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
      <section
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
        aria-labelledby="payout-heading"
      >
        <h2
          id="payout-heading"
          className="flex items-center gap-2 text-base font-bold text-ink-900"
        >
          <Wallet className="size-5 text-ink-500" aria-hidden="true" />
          Payout account
        </h2>

        {status.configured && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
            <CheckCircle2
              className="mt-0.5 size-5 shrink-0 text-brand-600"
              aria-hidden="true"
            />
            <div className="text-sm">
              <p className="font-semibold text-brand-900">
                Your payout account is connected
              </p>
              <p className="mt-0.5 text-brand-800">
                {status.accountName} &middot; {status.bankName} &middot;{" "}
                {status.accountNumberMasked}
              </p>
            </div>
          </div>
        )}

        {!status.paystackConfigured ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            <p className="font-semibold">Payments are not configured</p>
            <p className="mt-1">
              This deployment has no Paystack keys set, so payout accounts
              cannot be created yet. Contact the platform administrator.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
            <Select
              label="Bank or mobile money provider"
              required
              placeholder="Select your bank"
              options={banks.map((bank) => ({
                value: bank.code,
                label: bank.name,
              }))}
              value={bankCode}
              error={errors.bankCode}
              onChange={(event) => setBankCode(event.target.value)}
            />

            <Input
              label="Account number"
              required
              inputMode="numeric"
              placeholder="0123456789"
              hint="We verify this with your bank before saving it."
              value={accountNumber}
              error={errors.accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
            />

            <Button type="submit" loading={submitting}>
              {status.configured ? "Update payout account" : "Connect payout account"}
            </Button>
          </form>
        )}
      </section>

      <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
          <Info className="size-5 text-ink-500" aria-hidden="true" />
          How payouts work
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-ink-500">
          Tenants pay the rent you list. RentFinder keeps a{" "}
          {status.platformCommissionPercent}% platform commission and settles the
          remaining {status.landlordSharePercent}% directly to your bank account
          through Paystack.
        </p>

        <div className="mt-4 space-y-2 rounded-xl bg-surface-muted p-4 text-sm">
          <p className="font-semibold text-ink-900">Example</p>
          <dl className="space-y-1.5">
            <div className="flex justify-between">
              <dt className="text-ink-500">Tenant pays</dt>
              <dd className="font-medium text-ink-900">
                {formatGHS(exampleRent)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">
                Platform ({status.platformCommissionPercent}%)
              </dt>
              <dd className="font-medium text-ink-900">
                {formatGHS((exampleRent * status.platformCommissionPercent) / 100)}
              </dd>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5">
              <dt className="font-semibold text-ink-900">You receive</dt>
              <dd className="font-bold text-brand-700">
                {formatGHS((exampleRent * status.landlordSharePercent) / 100)}
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-4 text-xs text-ink-500">
          Your account number is stored securely and is never shown in full
          again once saved.
        </p>
      </aside>
    </div>
  );
}
