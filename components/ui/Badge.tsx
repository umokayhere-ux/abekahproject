import { BadgeCheck, CircleDot, ShieldOff } from "lucide-react";
import { cn } from "@/lib/cn";
import type { BookingStatus, PaymentStatus, PropertyStatus } from "@/types";

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-sunken text-ink-700 border-slate-200",
  success: "bg-brand-50 text-brand-800 border-brand-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-800 border-red-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const BOOKING_TONES: Record<BookingStatus, Tone> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
};

const PAYMENT_TONES: Record<PaymentStatus | "unpaid", Tone> = {
  pending: "warning",
  paid: "success",
  failed: "danger",
  unpaid: "neutral",
};

const PROPERTY_TONES: Record<PropertyStatus, Tone> = {
  available: "success",
  rented: "info",
};

/** Text label plus colour, so status is never conveyed by colour alone. */
export function StatusBadge({
  status,
  kind,
}: {
  status: string;
  kind: "booking" | "payment" | "property";
}) {
  const tone =
    kind === "booking"
      ? (BOOKING_TONES[status as BookingStatus] ?? "neutral")
      : kind === "payment"
        ? (PAYMENT_TONES[status as PaymentStatus] ?? "neutral")
        : (PROPERTY_TONES[status as PropertyStatus] ?? "neutral");

  return (
    <Badge tone={tone}>
      <CircleDot className="size-3" aria-hidden="true" />
      <span className="capitalize">{status}</span>
    </Badge>
  );
}

/** Verification marker for properties and landlords. */
export function VerifiedBadge({ verified }: { verified: boolean }) {
  if (verified) {
    return (
      <Badge tone="success">
        <BadgeCheck className="size-3.5" aria-hidden="true" />
        Verified
      </Badge>
    );
  }
  return (
    <Badge tone="neutral">
      <ShieldOff className="size-3.5" aria-hidden="true" />
      Unverified
    </Badge>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const tone: Tone =
    role === "admin" ? "danger" : role === "landlord" ? "info" : "neutral";
  return (
    <Badge tone={tone}>
      <span className="capitalize">{role}</span>
    </Badge>
  );
}
