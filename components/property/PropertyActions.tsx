"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Heart, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input, Textarea } from "@/components/ui/Field";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { formatGHS } from "@/lib/money";
import type { BookingDTO, PropertyDTO, SafeUser, SplitBreakdown } from "@/types";

/** Today in `YYYY-MM-DD`, used as the date input's minimum. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The book / message / save controls on a listing.
 *
 * Every action requires authentication; anonymous visitors are sent to the
 * login page rather than being shown a control that silently fails.
 */
export function PropertyActions({ property }: { property: PropertyDTO }) {
  const { user, setUser } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const [bookingOpen, setBookingOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [moveInDate, setMoveInDate] = useState(todayIso());
  const [messageText, setMessageText] = useState(
    `Hello, I am interested in "${property.title}". Is it still available?`,
  );
  const [submitting, setSubmitting] = useState(false);
  const [savingFavorite, setSavingFavorite] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();

  const isSaved = Boolean(user?.favorites?.includes(property._id));
  const isTenant = user?.role === "tenant";
  const landlordId =
    typeof property.landlord === "string"
      ? property.landlord
      : property.landlord._id;
  const isOwnListing = user?._id === landlordId;

  /** Sends unauthenticated users to sign in, preserving where they came from. */
  const requireSignIn = (): boolean => {
    if (!user) {
      toast.info("Sign in to continue");
      router.push(`/auth/login?next=/properties/${property._id}`);
      return false;
    }
    return true;
  };

  const handleBook = async () => {
    if (!moveInDate) {
      setFieldError("Choose a move-in date");
      return;
    }
    setFieldError(undefined);
    setSubmitting(true);
    try {
      const { booking } = await apiFetch<{
        booking: BookingDTO;
        split: SplitBreakdown;
      }>("/api/bookings", {
        method: "POST",
        body: { propertyId: property._id, moveInDate },
      });

      toast.success("Booking request sent. You can pay from your dashboard.");
      setBookingOpen(false);
      router.push(`/dashboard/tenant?tab=bookings&booking=${booking._id}`);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : "Could not create the booking";
      setFieldError(
        error instanceof ApiError ? error.errors?.moveInDate : undefined,
      );
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMessage = async () => {
    if (messageText.trim().length === 0) {
      setFieldError("Write a message first");
      return;
    }
    setFieldError(undefined);
    setSubmitting(true);
    try {
      await apiFetch("/api/conversations", {
        method: "POST",
        body: {
          recipientId: landlordId,
          propertyId: property._id,
          message: messageText.trim(),
        },
      });
      toast.success("Message sent to the landlord");
      setMessageOpen(false);
      router.push(
        user?.role === "landlord"
          ? "/dashboard/landlord?tab=messages"
          : "/dashboard/tenant?tab=messages",
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not send the message",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!requireSignIn()) return;
    if (!isTenant) {
      toast.info("Only tenant accounts can save properties");
      return;
    }

    setSavingFavorite(true);
    try {
      const data = await apiFetch<{ user: SafeUser }>(
        `/api/properties/${property._id}/favorite`,
        { method: isSaved ? "DELETE" : "POST" },
      );
      setUser(data.user);
      toast.success(isSaved ? "Removed from saved properties" : "Property saved");
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : "Could not update saved properties",
      );
    } finally {
      setSavingFavorite(false);
    }
  };

  const unavailable = property.status === "rented";

  return (
    <>
      <div className="mt-5 space-y-2.5">
        <Button
          fullWidth
          size="lg"
          disabled={unavailable || isOwnListing}
          onClick={() => {
            if (!requireSignIn()) return;
            if (!isTenant) {
              toast.info("Only tenant accounts can book a property");
              return;
            }
            setBookingOpen(true);
          }}
        >
          <CalendarCheck className="size-4.5" aria-hidden="true" />
          {unavailable ? "Already rented" : "Book / Rent"}
        </Button>

        <Button
          fullWidth
          variant="outline"
          disabled={isOwnListing}
          onClick={() => {
            if (!requireSignIn()) return;
            setMessageOpen(true);
          }}
        >
          <MessageSquare className="size-4.5" aria-hidden="true" />
          Message landlord
        </Button>

        <Button
          fullWidth
          variant="ghost"
          loading={savingFavorite}
          aria-pressed={isSaved}
          onClick={handleToggleFavorite}
        >
          <Heart
            className={isSaved ? "size-4.5 fill-red-500 text-red-500" : "size-4.5"}
            aria-hidden="true"
          />
          {isSaved ? "Saved" : "Save property"}
        </Button>

        {isOwnListing && (
          <p className="pt-1 text-center text-xs text-ink-500">
            This is your own listing.
          </p>
        )}
      </div>

      <Modal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        title="Request this property"
        description={`${property.title} — ${formatGHS(property.price)} per month`}
        footer={
          <>
            <Button variant="outline" onClick={() => setBookingOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleBook} loading={submitting}>
              Send booking request
            </Button>
          </>
        }
      >
        <Input
          type="date"
          label="Move-in date"
          required
          min={todayIso()}
          value={moveInDate}
          error={fieldError}
          hint="The landlord will confirm your request, then you can pay."
          onChange={(event) => setMoveInDate(event.target.value)}
        />
        <div className="mt-4 rounded-xl bg-surface-muted p-4 text-sm">
          <p className="font-semibold text-ink-900">What you will pay</p>
          <p className="mt-1 text-ink-500">
            First month&apos;s rent plus a one-month deposit, charged securely
            through Paystack once the landlord confirms.
          </p>
        </div>
      </Modal>

      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title="Message the landlord"
        description="Ask about availability, viewings, or anything else."
        footer={
          <>
            <Button variant="outline" onClick={() => setMessageOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMessage} loading={submitting}>
              Send message
            </Button>
          </>
        }
      >
        <Textarea
          label="Your message"
          required
          rows={5}
          value={messageText}
          error={fieldError}
          onChange={(event) => setMessageText(event.target.value)}
        />
      </Modal>
    </>
  );
}
