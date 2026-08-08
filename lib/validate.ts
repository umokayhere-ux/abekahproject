import mongoose from "mongoose";
import { HttpError } from "./api";

/**
 * Small hand-rolled validators. These run on the server for every request; the
 * matching client-side checks are a convenience only and are never trusted.
 */

/** Collects field errors so a form can show them all at once. */
export class Validator {
  private readonly errors: Record<string, string> = {};

  constructor(private readonly body: Record<string, unknown>) {}

  private raw(field: string): unknown {
    return this.body[field];
  }

  private addError(field: string, message: string): void {
    if (!this.errors[field]) this.errors[field] = message;
  }

  string(
    field: string,
    opts: { min?: number; max?: number; required?: boolean; label?: string } = {},
  ): string {
    const { min = 0, max = Infinity, required = true, label = field } = opts;
    const value = this.raw(field);

    if (value === undefined || value === null || value === "") {
      if (required) this.addError(field, `${label} is required`);
      return "";
    }
    if (typeof value !== "string") {
      this.addError(field, `${label} must be text`);
      return "";
    }
    const trimmed = value.trim();
    if (trimmed.length < min) {
      this.addError(field, `${label} must be at least ${min} characters`);
    }
    if (trimmed.length > max) {
      this.addError(field, `${label} must be at most ${max} characters`);
    }
    return trimmed;
  }

  email(field = "email"): string {
    const value = this.string(field, { label: "Email", max: 254 });
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      this.addError(field, "Enter a valid email address");
      return "";
    }
    return value.toLowerCase();
  }

  /**
   * Password policy: at least 8 characters with a letter and a digit. Long
   * enough to matter, loose enough not to push users toward reuse.
   */
  password(field = "password"): string {
    const value = this.raw(field);
    if (typeof value !== "string" || value.length === 0) {
      this.addError(field, "Password is required");
      return "";
    }
    if (value.length < 8) {
      this.addError(field, "Password must be at least 8 characters");
    } else if (value.length > 128) {
      this.addError(field, "Password must be at most 128 characters");
    } else if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
      this.addError(field, "Password must include a letter and a number");
    }
    return value;
  }

  /**
   * Ghanaian phone numbers: local `0XXXXXXXXX` or international `+233XXXXXXXXX`.
   */
  phone(field = "phone", required = false): string {
    const value = this.raw(field);
    if (value === undefined || value === null || value === "") {
      if (required) this.addError(field, "Phone number is required");
      return "";
    }
    if (typeof value !== "string") {
      this.addError(field, "Phone number must be text");
      return "";
    }
    const compact = value.replace(/[\s-()]/g, "");
    if (!/^(?:\+233\d{9}|0\d{9})$/.test(compact)) {
      this.addError(
        field,
        "Enter a valid Ghanaian phone number, e.g. 0244123456 or +233244123456",
      );
      return "";
    }
    // Normalise to international form for consistent storage.
    return compact.startsWith("0") ? `+233${compact.slice(1)}` : compact;
  }

  number(
    field: string,
    opts: {
      min?: number;
      max?: number;
      required?: boolean;
      integer?: boolean;
      label?: string;
    } = {},
  ): number {
    const {
      min = -Infinity,
      max = Infinity,
      required = true,
      integer = false,
      label = field,
    } = opts;
    const value = this.raw(field);

    if (value === undefined || value === null || value === "") {
      if (required) this.addError(field, `${label} is required`);
      return NaN;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      this.addError(field, `${label} must be a number`);
      return NaN;
    }
    if (integer && !Number.isInteger(parsed)) {
      this.addError(field, `${label} must be a whole number`);
      return NaN;
    }
    if (parsed < min) this.addError(field, `${label} must be at least ${min}`);
    if (parsed > max) this.addError(field, `${label} must be at most ${max}`);
    return parsed;
  }

  enum<T extends string>(
    field: string,
    allowed: readonly T[],
    opts: { required?: boolean; label?: string } = {},
  ): T | undefined {
    const { required = true, label = field } = opts;
    const value = this.raw(field);
    if (value === undefined || value === null || value === "") {
      if (required) this.addError(field, `${label} is required`);
      return undefined;
    }
    if (typeof value !== "string" || !allowed.includes(value as T)) {
      this.addError(field, `${label} must be one of: ${allowed.join(", ")}`);
      return undefined;
    }
    return value as T;
  }

  objectId(field: string, opts: { required?: boolean; label?: string } = {}): string {
    const { required = true, label = field } = opts;
    const value = this.raw(field);
    if (value === undefined || value === null || value === "") {
      if (required) this.addError(field, `${label} is required`);
      return "";
    }
    if (typeof value !== "string" || !mongoose.isValidObjectId(value)) {
      this.addError(field, `${label} is not a valid id`);
      return "";
    }
    return value;
  }

  /** A future-dated calendar date, used for move-in dates. */
  futureDate(field: string, opts: { label?: string } = {}): Date {
    const { label = field } = opts;
    const value = this.raw(field);
    if (typeof value !== "string" && !(value instanceof Date)) {
      this.addError(field, `${label} is required`);
      return new Date(NaN);
    }
    const date = new Date(value as string);
    if (Number.isNaN(date.getTime())) {
      this.addError(field, `${label} is not a valid date`);
      return date;
    }
    // Compare against the start of today so "today" remains acceptable.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      this.addError(field, `${label} cannot be in the past`);
    }
    return date;
  }

  stringArray(
    field: string,
    opts: { maxItems?: number; maxLength?: number; label?: string } = {},
  ): string[] {
    const { maxItems = 50, maxLength = 200, label = field } = opts;
    const value = this.raw(field);
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      this.addError(field, `${label} must be a list`);
      return [];
    }
    if (value.length > maxItems) {
      this.addError(field, `${label} may have at most ${maxItems} entries`);
      return [];
    }
    const cleaned = value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0 && v.length <= maxLength);
    return Array.from(new Set(cleaned));
  }

  /** Only accepts https URLs, which is what our image providers return. */
  urlArray(field: string, opts: { maxItems?: number } = {}): string[] {
    const { maxItems = 12 } = opts;
    const items = this.stringArray(field, { maxItems, maxLength: 2000 });
    const valid: string[] = [];
    for (const item of items) {
      try {
        const url = new URL(item);
        if (url.protocol !== "https:") {
          this.addError(field, "Image URLs must use https");
          break;
        }
        valid.push(url.toString());
      } catch {
        this.addError(field, "One of the image URLs is not valid");
        break;
      }
    }
    return valid;
  }

  boolean(field: string, fallback = false): boolean {
    const value = this.raw(field);
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
  }

  /** Throws a 422 if anything failed; otherwise returns nothing. */
  assert(): void {
    if (Object.keys(this.errors).length > 0) {
      throw new HttpError(422, "Please correct the highlighted fields", this.errors);
    }
  }
}

/** Reads and shape-checks a JSON request body. */
export async function readJson(
  request: Request,
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

/** Clamped pagination so a client cannot request an unbounded page. */
export function parsePagination(
  params: URLSearchParams,
  { defaultLimit = 12, maxLimit = 100 } = {},
): { page: number; limit: number; skip: number } {
  const rawPage = Number(params.get("page") ?? 1);
  const rawLimit = Number(params.get("limit") ?? defaultLimit);

  const page =
    Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), maxLimit)
      : defaultLimit;

  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Escapes a user-supplied search term before it is placed in a `$regex`, so a
 * crafted query cannot become an expensive or unintended pattern.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Validates a path parameter id, throwing a 400 rather than a cast error. */
export function requireObjectId(id: string, label = "id"): string {
  if (!mongoose.isValidObjectId(id)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
  return id;
}
