import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpError, withErrorHandling } from "@/lib/api";
import { ConfigError } from "@/lib/env";
import { DatabaseUnavailableError } from "@/lib/db";
import type { ApiResponse } from "@/types";

/**
 * A misconfigured deployment must be distinguishable from a code bug.
 *
 * These lock in the fix for a real report: sign-up failed with
 * "Something went wrong. Please try again." and there was no way to tell a
 * missing environment variable from an unreachable database from an actual
 * defect.
 */

/** Runs a handler that throws, and reads the response it produced. */
async function responseFor(error: unknown) {
  const handler = withErrorHandling(async () => {
    throw error;
  });
  const response = await handler();
  return {
    status: response.status,
    body: (await response.json()) as ApiResponse<never>,
  };
}

/** Narrows to the failure branch so `message` is accessible. */
function messageOf(body: ApiResponse<never>): string {
  if (body.success) throw new Error("Expected a failure response");
  return body.message;
}

describe("configuration errors", () => {
  it("answers 503 and names the offending variable", async () => {
    const { status, body } = await responseFor(
      new ConfigError("MONGODB_URI", "Missing required environment variable"),
    );

    expect(status).toBe(503);
    expect(messageOf(body)).toContain("MONGODB_URI");
    expect(messageOf(body)).toContain("environment variables");
  });

  it("names JWT_SECRET when that is the problem", async () => {
    const { status, body } = await responseFor(
      new ConfigError("JWT_SECRET", "JWT_SECRET must be at least 32 characters"),
    );

    expect(status).toBe(503);
    expect(messageOf(body)).toContain("JWT_SECRET");
  });

  it("never leaks the variable's value", async () => {
    // The name is safe to publish; the value never is.
    const { body } = await responseFor(
      new ConfigError(
        "JWT_SECRET",
        "JWT_SECRET must be at least 32 characters long. Got: super-secret-value",
      ),
    );

    expect(messageOf(body)).not.toContain("super-secret-value");
  });
});

describe("database connectivity errors", () => {
  it("answers 503 with a message pointing at the likely cause", async () => {
    const { status, body } = await responseFor(
      new DatabaseUnavailableError(new Error("connect ECONNREFUSED 10.1.2.3:27017")),
    );

    expect(status).toBe(503);
    expect(messageOf(body)).toContain("Atlas");
    expect(messageOf(body)).toContain("MONGODB_URI");
  });

  it("does not leak the database host or port", async () => {
    const { body } = await responseFor(
      new DatabaseUnavailableError(
        new Error(
          "connect ECONNREFUSED cluster0.abc123.mongodb.net:27017 user=admin",
        ),
      ),
    );

    const message = messageOf(body);
    expect(message).not.toContain("cluster0.abc123.mongodb.net");
    expect(message).not.toContain("27017");
    // The credential fragment, not the bare word — the advisory text
    // legitimately contains "administrator".
    expect(message).not.toContain("user=admin");
  });
});

describe("genuine bugs", () => {
  const originalEnv = process.env.NODE_ENV;
  // Typed read-only by Next, but an ordinary writable string at runtime.
  const setNodeEnv = (value: string | undefined) => {
    (process.env as Record<string, string | undefined>).NODE_ENV = value;
  };

  beforeEach(() => setNodeEnv("production"));
  afterEach(() => setNodeEnv(originalEnv));

  it("still returns an opaque 500 in production", async () => {
    const { status, body } = await responseFor(
      new Error("Cannot read properties of undefined (reading 'foo')"),
    );

    expect(status).toBe(500);
    // Unlike a config error, a real bug reveals nothing.
    expect(messageOf(body)).toBe("Something went wrong. Please try again.");
    expect(messageOf(body)).not.toContain("undefined");
  });

  it("is not confused by an error that merely mentions configuration", async () => {
    const { status } = await responseFor(
      new Error("MONGODB_URI looked fine but something else broke"),
    );

    // Classification is by type, not by string matching.
    expect(status).toBe(500);
  });
});

describe("explicit HttpErrors still pass through", () => {
  it("preserves the status and field errors", async () => {
    const { status, body } = await responseFor(
      new HttpError(422, "Please correct the highlighted fields", {
        email: "Enter a valid email address",
      }),
    );

    expect(status).toBe(422);
    expect(messageOf(body)).toBe("Please correct the highlighted fields");
    if (!body.success) {
      expect(body.errors?.email).toBe("Enter a valid email address");
    }
  });
});
