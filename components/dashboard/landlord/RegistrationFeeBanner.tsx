"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CreditCard, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ApiError, apiFetch } from "@/lib/client";
import { formatGHS } from "@/lib/money";

interface FeeStatus {
  amount: number;
  currency: string;
  paid: boolean;
}

/**
 * Prompts a landlord to pay the one-off listing fee, and handles the return
 * trip from Paystack.
 *
 * The amount is read from the server rather than hardcoded, so changing the
 * configured fee does not require a UI change. Payment is confirmed by the
 * webhook; the callback here only asks the server what happened.
 */
export function RegistrationFeeBanner({ onPaid }: { onPaid: () => void }) {
  const toast = useToast();
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference");

  const [fee, setFee] = useState<FeeStatus | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(() => {
      apiFetch<FeeStatus>("/api/payments/registration-fee")
        .then((status) => {
          if (!cancelled) setFee(status);
        })
        .catch(() => {
          // The banner simply shows a generic prompt if the amount cannot be
          // read; the payment attempt itself will surface any real problem.
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Paystack redirects back here after checkout.
  useEffect(() => {
    if (!reference) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      apiFetch<{ status: string }>(`/api/payments/verify?reference=${reference}`)
        .then((result) => {
          if (cancelled) return;
          if (result.status === "paid") {
            toast.success("Registration fee received. You can now add listings.");
            onPaid();
          } else if (result.status === "failed") {
            toast.error("That payment did not go through. Please try again.");
          } else {
            toast.info("Your payment is still being processed.");
          }
        })
        .catch(() => undefined);
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Runs once per reference; the callbacks change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const handlePay = async () => {
    setStarting(true);
    try {
      const { authorizationUrl } = await apiFetch<{ authorizationUrl: string }>(
        "/api/payments/registration-fee",
        { method: "POST" },
      );
      window.location.assign(authorizationUrl);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not start the payment",
      );
      setStarting(false);
    }
  };

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border-2 border-brand-300 bg-brand-50 p-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden="true" />
        <div>
          <p className="font-semibold text-brand-900">
            Pay your one-off registration fee
            {fee ? ` of ${formatGHS(fee.amount)}` : ""}
          </p>
          <p className="mt-0.5 text-sm text-brand-800">
            This is a single payment that unlocks listing on RentFinder. You can
            add and manage properties as soon as it clears.
          </p>
        </div>
      </div>

      <Button onClick={handlePay} loading={starting} className="shrink-0">
        <CreditCard className="size-4" aria-hidden="true" />
        {fee ? `Pay ${formatGHS(fee.amount)}` : "Pay now"}
      </Button>
    </div>
  );
}
