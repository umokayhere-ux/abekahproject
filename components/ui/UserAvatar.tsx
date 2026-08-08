import Image from "next/image";
import { cn } from "@/lib/cn";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-base",
  xl: "size-20 text-xl",
} as const;

const PIXELS = { sm: 32, md: 40, lg: 56, xl: 80 } as const;

/** Derives up to two initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * Avatar with an initials fallback, so a missing image never leaves a blank
 * circle. The image is decorative next to the name it accompanies.
 */
export function UserAvatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const dimension = PIXELS[size];

  if (src) {
    return (
      <Image
        src={src}
        alt=""
        width={dimension}
        height={dimension}
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-slate-200",
          SIZES[size],
          className,
        )}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-800 ring-1 ring-brand-200",
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
