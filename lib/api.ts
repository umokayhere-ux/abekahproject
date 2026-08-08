import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { ConfigError, env } from "./env";
import { DatabaseUnavailableError } from "./db";
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

      /*
       * A misconfigured deployment is the operator's problem to fix, not a bug,
       * and it must not be reported as an indistinguishable 500. The variable
       * name is not a secret — its *value* is — so naming it turns an
       * unexplained failure into a one-line fix.
       */
      if (error instanceof ConfigError) {
        console.error(
          `[api] configuration error: ${error.variable} — ${error.message}`,
        );
        return fail(
          `This deployment is missing required configuration (${error.variable}). ` +
            "If you are the administrator, check your environment variables.",
          503,
        );
      }

      if (error instanceof DatabaseUnavailableError) {
        // The driver's message names the host and port, so it is logged but
        // never returned.
        console.error("[api] database unavailable:", error.cause);
        return fail(
          "Cannot reach the database right now. If you are the administrator, " +
            "check MONGODB_URI and that your IP is allowed in MongoDB Atlas.",
          503,
        );
      }

      // Anything left really is unexpected. Log it; tell the client nothing
      // diagnostic in production.
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
