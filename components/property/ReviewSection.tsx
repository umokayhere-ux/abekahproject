"use client";

import { useState } from "react";
import { MessageSquareQuote, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select, Textarea } from "@/components/ui/Field";
import { EmptyState } from "@/components/ui/States";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, apiFetch } from "@/lib/client";
import { cn } from "@/lib/cn";
import type { ReviewDTO, SafeUser } from "@/types";

/** Star row. The numeric rating is also given as text for screen readers. */
function Stars({ rating, size = "sm" }: { rating: number; size?: "sm" | "md" }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            size === "sm" ? "size-4" : "size-5",
            star <= Math.round(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-slate-300",
          )}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{rating} out of 5 stars</span>
    </span>
  );
}

const RATING_OPTIONS = [5, 4, 3, 2, 1].map((value) => ({
  value: String(value),
  label: `${value} star${value === 1 ? "" : "s"}`,
}));

export function ReviewSection({
  propertyId,
  initialReviews,
  ratingAverage,
  ratingCount,
}: {
  propertyId: string;
  initialReviews: ReviewDTO[];
  ratingAverage: number;
  ratingCount: number;
}) {
  const { user } = useAuth();
  const toast = useToast();

  const [reviews, setReviews] = useState(initialReviews);
  const [summary, setSummary] = useState({
    average: ratingAverage,
    count: ratingCount,
  });
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Only tenants may review, and the server additionally requires a confirmed
  // booking — this check just avoids showing a button that would be rejected.
  const canAttemptReview =
    user?.role === "tenant" &&
    !reviews.some(
      (review) =>
        typeof review.author !== "string" && review.author._id === user._id,
    );

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors({});
    try {
      const { review } = await apiFetch<{ review: ReviewDTO }>(
        `/api/properties/${propertyId}/reviews`,
        { method: "POST", body: { rating: Number(rating), comment } },
      );

      setReviews((current) => [review, ...current]);
      setSummary((current) => {
        const nextCount = current.count + 1;
        const nextAverage =
          (current.average * current.count + Number(rating)) / nextCount;
        return { average: Math.round(nextAverage * 10) / 10, count: nextCount };
      });

      toast.success("Thank you for your review");
      setOpen(false);
      setComment("");
    } catch (error) {
      if (error instanceof ApiError) {
        setErrors(error.errors ?? {});
        toast.error(error.message);
      } else {
        toast.error("Could not submit your review");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mt-10" aria-labelledby="reviews-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="reviews-heading" className="text-xl font-bold text-ink-900">
            Reviews
          </h2>
          {summary.count > 0 ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Stars rating={summary.average} size="md" />
              <p className="text-sm text-ink-500">
                {summary.average.toFixed(1)} from {summary.count} review
                {summary.count === 1 ? "" : "s"}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-sm text-ink-500">No reviews yet</p>
          )}
        </div>

        {canAttemptReview && (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Write a review
          </Button>
        )}
      </div>

      <div className="mt-5">
        {reviews.length === 0 ? (
          <EmptyState
            icon={MessageSquareQuote}
            title="No reviews yet"
            description="Reviews appear once a tenant has completed a confirmed booking on this property."
          />
        ) : (
          <ul className="space-y-4">
            {reviews.map((review) => {
              const author =
                typeof review.author === "string"
                  ? null
                  : (review.author as SafeUser);
              return (
                <li
                  key={review._id}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      name={author?.name ?? "Tenant"}
                      src={author?.avatar}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="font-semibold text-ink-900">
                          {author?.name ?? "Tenant"}
                        </p>
                        <Stars rating={review.rating} />
                        {review.createdAt && (
                          <time
                            dateTime={review.createdAt}
                            className="text-xs text-ink-500"
                          >
                            {new Date(review.createdAt).toLocaleDateString("en-GH", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </time>
                        )}
                      </div>
                      <p className="mt-2 leading-relaxed text-ink-700">
                        {review.comment}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Write a review"
        description="Share your experience to help other renters."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Submit review
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Rating"
            required
            options={RATING_OPTIONS}
            value={rating}
            error={errors.rating}
            onChange={(event) => setRating(event.target.value)}
          />
          <Textarea
            label="Your review"
            required
            rows={5}
            value={comment}
            error={errors.comment}
            placeholder="What was it like living here?"
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </Modal>
    </section>
  );
}
