"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Info, Smartphone, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { formatGHS } from "@/lib/money";
import { cn } from "@/lib/cn";
import type { PayoutChannel, SafeUser } from "@/types";

interface PayoutStatus {
  configured: boolean;
  channel: PayoutChannel | null;
  bankName: string;
  accountName: string;
  accountNumberMasked: string;
  landlordSharePercent: number;
  platformCommissionPercent: number;
  paystackConfigured: boolean;
}

interface Destination {
  name: string;
  code: string;
}

const CHANNELS: {
  value: PayoutChannel;
  label: string;
  hint: string;
  icon: typeof Smartphone;
}[] = [
  {
    value: "mobile_money",
    label: "Mobile money",
    hint: "MTN, Telecel, AirtelTigo",
    icon: Smartphone,
  },
  {
    value: "bank",
    label: "Bank account",
    hint: "Any Ghanaian bank",
    icon: Building2,
  },
];

/**
 * Paystack payout setup, for either a mobile money wallet or a bank account.
 *
 * The provider list and the subaccount creation both run server-side; the
 * secret key never reaches the browser, and the full number is never returned
 * once saved.
 */
export function PayoutSetup({ onConfigured }: { onConfigured: () => void }) {
  const { setUser } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [banks, setBanks] = useState<Destination[]>([]);
  const [wallets, setWallets] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mobile money leads: it is how most Ghanaian landlords are paid.
  const [channel, setChannel] = useState<PayoutChannel>("mobile_money");
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
        if (payoutStatus.channel) setChannel(payoutStatus.channel);

        if (payoutStatus.paystackConfigured) {
          const data = await apiFetch<{
            banks: Destination[];
            mobileMoney: Destination[];
          }>("/api/landlord/banks");
          if (cancelled) return;
          setBanks(data.banks);
          setWallets(data.mobileMoney);
          // If Paystack returned no wallets for this account, do not strand the
          // landlord on an empty picker.
          if (data.mobileMoney.length === 0) setChannel("bank");
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

  const isMomo = channel === "mobile_money";
  const options = isMomo ? wallets : banks;

  const switchChannel = (next: PayoutChannel) => {
    setChannel(next);
    // The codes and number formats differ, so previous input is meaningless.
    setBankCode("");
    setAccountNumber("");
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});

    const destination = options.find((entry) => entry.code === bankCode);
    if (!destination) {
      setErrors({
        bankCode: isMomo ? "Choose your provider" : "Choose your bank",
      });
      setSubmitting(false);
      return;
    }

    try {
      const result = await apiFetch<{ accountName: string; user: SafeUser }>(
        "/api/landlord/payout",
        {
          method: "POST",
          body: {
            channel,
            bankCode,
            bankName: destination.name,
            accountNumber,
          },
        },
      );

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
          Where should we send your rent?
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
              {status.channel && (
                <p className="mt-0.5 text-xs text-brand-700">
                  Paid by{" "}
                  {status.channel === "mobile_money"
                    ? "mobile money"
                    : "bank transfer"}
                </p>
              )}
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
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-ink-700">
                How would you like to be paid?
              </legend>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {CHANNELS.map((option) => {
                  // Hide mobile money if this Paystack account offers none.
                  const unavailable =
                    option.value === "mobile_money" && wallets.length === 0;
                  if (unavailable) return null;

                  const selected = channel === option.value;
                  return (
                    <label
                      key={option.value}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition-colors",
                        selected
                          ? "border-brand-600 bg-brand-50"
                          : "border-slate-300 hover:bg-surface-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name="payout-channel"
                        value={option.value}
                        checked={selected}
                        onChange={() => switchChannel(option.value)}
                        className="size-4 accent-brand-600"
                      />
                      <option.icon
                        className="size-5 shrink-0 text-brand-700"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-ink-900">
                          {option.label}
                        </span>
                        <span className="block text-xs text-ink-500">
                          {option.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <Select
              label={isMomo ? "Mobile money provider" : "Bank"}
              required
              placeholder={
                isMomo ? "Select your provider" : "Select your bank"
              }
              options={options.map((entry) => ({
                value: entry.code,
                label: entry.name,
              }))}
              value={bankCode}
              error={errors.bankCode}
              onChange={(event) => setBankCode(event.target.value)}
            />

            <Input
              label={isMomo ? "Mobile money number" : "Account number"}
              required
              inputMode="numeric"
              placeholder={isMomo ? "0244123456" : "0123456789"}
              hint={
                isMomo
                  ? "The number registered to your wallet. We verify it with your provider before saving."
                  : "We verify this with your bank before saving it."
              }
              value={accountNumber}
              error={errors.accountNumber}
              onChange={(event) => setAccountNumber(event.target.value)}
            />

            <Button type="submit" loading={submitting}>
              {status.configured
                ? "Update payout account"
                : "Connect payout account"}
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
          remaining {status.landlordSharePercent}% straight to your{" "}
          {isMomo ? "mobile money wallet" : "bank account"} through Paystack.
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
          Your {isMomo ? "wallet number" : "account number"} is stored securely
          and is never shown in full again once saved.
        </p>
      </aside>
    </div>
  );
}
