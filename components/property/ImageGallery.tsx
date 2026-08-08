"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Property image gallery with a main frame and thumbnail strip.
 * Arrow controls are real buttons, so the gallery works from the keyboard.
 */
export function ImageGallery({
  images,
  title,
}: {
  images: string[];
  title: string;
}) {
  const [index, setIndex] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-2xl border border-slate-200 bg-surface-sunken text-ink-500 sm:h-96">
        <div className="text-center">
          <ImageOff className="mx-auto size-9" aria-hidden="true" />
          <p className="mt-2 text-sm">No photos provided for this property</p>
        </div>
      </div>
    );
  }

  const total = images.length;
  const go = (next: number) => setIndex(((next % total) + total) % total);

  return (
    <div className="space-y-3">
      <div className="relative h-72 overflow-hidden rounded-2xl bg-surface-sunken sm:h-96">
        <Image
          src={images[index]!}
          alt={`${title} — photo ${index + 1} of ${total}`}
          fill
          sizes="(max-width: 1024px) 100vw, 66vw"
          className="object-cover"
          priority={index === 0}
        />

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/95 p-2.5 shadow-md transition-colors hover:bg-white"
              aria-label="Previous photo"
            >
              <ChevronLeft className="size-5 text-ink-900" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/95 p-2.5 shadow-md transition-colors hover:bg-white"
              aria-label="Next photo"
            >
              <ChevronRight className="size-5 text-ink-900" aria-hidden="true" />
            </button>
            <p className="absolute right-3 bottom-3 rounded-full bg-ink-900/75 px-3 py-1 text-xs font-medium text-white">
              {index + 1} / {total}
            </p>
          </>
        )}
      </div>

      {total > 1 && (
        <div className="table-scroll flex gap-2 pb-1">
          {images.map((image, thumbIndex) => (
            <button
              key={image}
              type="button"
              onClick={() => setIndex(thumbIndex)}
              aria-label={`Show photo ${thumbIndex + 1}`}
              aria-current={thumbIndex === index ? "true" : undefined}
              className={cn(
                "relative size-18 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                thumbIndex === index
                  ? "border-brand-600"
                  : "border-transparent hover:border-slate-300",
              )}
            >
              <Image
                src={image}
                alt=""
                fill
                sizes="72px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
