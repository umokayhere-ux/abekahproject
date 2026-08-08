import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { env } from "@/lib/env";
import { isPaystackConfigured } from "@/lib/paystack";
import { isUploadConfigured } from "@/lib/cloudinary";

/**
 * GET /api/health
 *
 * Deployment self-check. Answers "why is sign-up failing?" in one request,
 * without needing server logs.
 *
 * It reports only *whether* each integration is configured and whether the
 * database is reachable — never a value, a connection string, or a key. That
 * makes it safe to leave unauthenticated, which matters because the most
 * common time you need it is when authentication itself is broken.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    database: { configured: Boolean(process.env.MONGODB_URI), reachable: false },
    // Length only — enough to spot a too-short secret without revealing it.
    jwt: {
      configured: Boolean(process.env.JWT_SECRET),
      longEnough: (process.env.JWT_SECRET ?? "").length >= 32,
    },
    adminSeed: {
      configured:
        Boolean(process.env.ADMIN_EMAIL) && Boolean(process.env.ADMIN_PASSWORD),
    },
    paystack: { configured: isPaystackConfigured() },
    cloudinary: { configured: isUploadConfigured() },
    email: { configured: Boolean(env.smtp) },
  };

  /*
   * Which deployment is answering. A variable scoped only to Production is
   * invisible to a Preview build, which is the most common reason setting one
   * "does nothing" — a branch that is not the Production Branch deploys as a
   * Preview. None of these values are secret; Vercel exposes them to the build.
   */
  const deployment = {
    platform: process.env.VERCEL ? "vercel" : "self-hosted",
    // "production" | "preview" | "development" on Vercel.
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
  };

  let databaseError: string | undefined;
  if (checks.database.configured) {
    try {
      await connectDB();
      checks.database.reachable = true;
    } catch {
      // The underlying message names the host, so only a category is exposed.
      databaseError = "Connection failed. Check MONGODB_URI and Atlas network access.";
    }
  }

  // Sign-up and sign-in need exactly these three things.
  const canAuthenticate =
    checks.database.reachable && checks.jwt.configured && checks.jwt.longEnough;

  const problems: string[] = [];
  if (!checks.database.configured) {
    problems.push(
      deployment.environment === "preview"
        ? "MONGODB_URI is not set for this PREVIEW deployment. Check the " +
            "variable is scoped to Preview, then redeploy."
        : "MONGODB_URI is not set",
    );
  } else if (!checks.database.reachable) problems.push(databaseError!);
  if (!checks.jwt.configured) {
    problems.push(
      deployment.environment === "preview"
        ? "JWT_SECRET is not set for this PREVIEW deployment. A variable " +
            "scoped only to Production is not visible here — tick Preview " +
            "too, then redeploy."
        : "JWT_SECRET is not set",
    );
  } else if (!checks.jwt.longEnough) {
    problems.push("JWT_SECRET is shorter than 32 characters");
  }
  if (!checks.adminSeed.configured) {
    problems.push(
      "ADMIN_EMAIL / ADMIN_PASSWORD are not set — no administrator will exist",
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        status: canAuthenticate ? "ok" : "degraded",
        deployment,
        canAuthenticate,
        canAcceptPayments: checks.paystack.configured,
        canUploadImages: checks.cloudinary.configured,
        canSendEmail: checks.email.configured,
        checks,
        problems,
      },
    },
    // 503 when sign-up cannot possibly work, so uptime monitors notice.
    { status: canAuthenticate ? 200 : 503 },
  );
}
