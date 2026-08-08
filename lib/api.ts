import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { env } from "./env";
import type { ApiResponse } from "@/types";

/**
 * Uniform API envelope helpers. Every route handler returns one of these so the
 * client can rely on a single response shape.
 */

export function ok<T>(data: T, status = 200) {
  return NextResponse.json<ApiResponse<T>>({ success: true, data }, { status });
}

export function fail(
  message: string,
  status = 400,
  errors?: Record<string, string>,
) {
  return NextResponse.json<ApiResponse<never>>(
    { success: false, message, ...(errors ? { errors } : {}) },
    { status },
  );
}

export const unauthorized = (message = "Unauthorized") => fail(message, 401);
export const forbidden = (message = "Forbidden") => fail(message, 403);
export const notFound = (message = "Not found") => fail(message, 404);

/** Thrown by validators and handlers to produce a specific status code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

interface MongoServerError {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

/**
 * Wraps a route handler so no unexpected throw ever leaks a stack trace to a
 * client. Known error shapes (validation, duplicate key, cast) are translated
 * into meaningful status codes; everything else becomes an opaque 500.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return fail(error.message, error.status, error.errors);
      }

      if (error instanceof mongoose.Error.ValidationError) {
        const errors: Record<string, string> = {};
        for (const [field, issue] of Object.entries(error.errors)) {
          errors[field] = issue.message;
        }
        return fail("Validation failed", 422, errors);
      }

      if (error instanceof mongoose.Error.CastError) {
        return fail(`Invalid value for ${error.path}`, 400);
      }

      const mongoError = error as MongoServerError;
      if (mongoError?.code === 11000) {
        const field = Object.keys(mongoError.keyPattern ?? {})[0];
        return fail(
          field
            ? `A record with that ${field} already exists`
            : "Duplicate record",
          409,
        );
      }

      // Log server-side only; the client gets nothing diagnostic.
      console.error("[api] unhandled error:", error);
      return fail(
        env.isProduction
          ? "Something went wrong. Please try again."
          : `Server error: ${(error as Error)?.message ?? "unknown"}`,
        500,
      );
    }
  };
}

/** Best-effort client IP for the audit log, from standard proxy headers. */
export function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? undefined;
}
