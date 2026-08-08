import { User } from "@/models/User";
import { connectDB } from "./db";
import { env } from "./env";
import { hashPassword } from "./auth";

/**
 * Ensures the configured superadmin exists.
 *
 * Invoked lazily from the auth routes (and from the seed script) rather than at
 * module load, because a serverless cold start must not block on extra writes
 * for unrelated requests. The result is cached per container so the work only
 * happens once per lambda lifetime.
 *
 * There is deliberately no HTTP endpoint that grants admin — this is the only
 * path by which the role can be created.
 */

let seedPromise: Promise<void> | null = null;

async function doSeed(): Promise<void> {
  const email = env.adminEmail;
  const password = env.adminPassword;

  if (!email || !password) {
    // Admin seeding is optional; the platform still runs without it.
    return;
  }

  await connectDB();
  const existing = await User.findOne({ email }).select(
    "+password role suspended",
  );

  if (!existing) {
    await User.create({
      name: env.adminName,
      email,
      password: await hashPassword(password),
      role: "admin",
      verified: true,
      suspended: false,
    });
    console.log(`[seed-admin] created admin account ${email}`);
    return;
  }

  // Resync the configured account: it must be an active, verified admin, and
  // its password must match whatever the environment currently specifies.
  const updates: Record<string, unknown> = {};
  if (existing.role !== "admin") updates.role = "admin";
  if (existing.suspended) updates.suspended = false;
  if (!existing.verified) updates.verified = true;
  if (env.adminName && existing.name !== env.adminName) {
    updates.name = env.adminName;
  }
  updates.password = await hashPassword(password);

  await User.updateOne({ _id: existing._id }, { $set: updates });
}

export async function ensureAdminSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = doSeed().catch((error) => {
      // Reset so a later request can retry a transient failure.
      seedPromise = null;
      console.error("[seed-admin] failed:", error);
    });
  }
  return seedPromise;
}
