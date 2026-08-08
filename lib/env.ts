/**
 * Server-only environment access.
 *
 * Everything here is read lazily so that importing a module does not crash the
 * build when an optional integration (Cloudinary, SMTP) is not configured.
 * Nothing in this file may be imported from a Client Component.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  get mongodbUri() {
    return required("MONGODB_URI");
  },
  get jwtSecret() {
    const secret = required("JWT_SECRET");
    if (secret.length < 32) {
      throw new Error("JWT_SECRET must be at least 32 characters long.");
    }
    return secret;
  },

  get adminEmail() {
    return optional("ADMIN_EMAIL")?.toLowerCase();
  },
  get adminPassword() {
    return optional("ADMIN_PASSWORD");
  },
  get adminName() {
    return optional("ADMIN_NAME") ?? "RentFinder Admin";
  },

  get paystackSecretKey() {
    return optional("PAYSTACK_SECRET_KEY");
  },
  get paystackPublicKey() {
    return optional("PAYSTACK_PUBLIC_KEY");
  },

  get cloudinary() {
    const cloudName = optional("CLOUDINARY_CLOUD_NAME");
    const apiKey = optional("CLOUDINARY_API_KEY");
    const apiSecret = optional("CLOUDINARY_API_SECRET");
    if (!cloudName || !apiKey || !apiSecret) return undefined;
    return { cloudName, apiKey, apiSecret };
  },

  get smtp() {
    const host = optional("SMTP_HOST");
    if (!host) return undefined;
    return {
      host,
      port: Number(optional("SMTP_PORT") ?? 587),
      user: optional("SMTP_USER"),
      pass: optional("SMTP_PASSWORD"),
      from: optional("EMAIL_FROM") ?? "RentFinder <no-reply@rentfinder.gh>",
    };
  },

  get appUrl() {
    const explicit = optional("NEXT_PUBLIC_APP_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const vercel = optional("VERCEL_PROJECT_PRODUCTION_URL") ?? optional("VERCEL_URL");
    if (vercel) return `https://${vercel}`;
    return "http://localhost:3000";
  },

  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
};

/**
 * Platform commission, in percent, absorbed by the landlord.
 *
 * Read on each access rather than captured at module load, so it stays
 * consistent with the rest of this module and can be varied in tests. Falls
 * back to 10 if the value is missing or nonsensical — a bad env var must never
 * silently produce a zero or negative commission.
 */
export function platformCommissionPercent(): number {
  // `?? ` alone is not enough: an env var set to "" is present but empty, and
  // Number("") is 0 — which would silently waive the commission entirely.
  const raw = optional("PLATFORM_COMMISSION_PERCENT");
  if (raw === undefined) return 10;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) return 10;
  return value;
}

/**
 * Whether the first payment bundles a security deposit alongside the first
 * month's rent, and how many months of rent that deposit is worth. Kept in env
 * so the payment shape can be extended without code changes.
 */
export const PAYMENT_CONFIG = {
  get includeDeposit() {
    // Defaults to on; only an explicit "false" turns it off.
    return optional("PAYMENT_INCLUDE_DEPOSIT") !== "false";
  },
  get depositMonths() {
    // As above, an empty value must fall back rather than becoming 0.
    const raw = optional("PAYMENT_DEPOSIT_MONTHS");
    if (raw === undefined) return 1;

    const months = Number(raw);
    return Number.isFinite(months) && months >= 0 && months <= 12 ? months : 1;
  },
};
