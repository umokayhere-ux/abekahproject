import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll } from "vitest";

/**
 * Spins up an in-memory MongoDB for the whole run, so integration tests
 * exercise real Mongoose queries, indexes, and unique constraints rather than
 * mocks.
 *
 * `mongodb-memory-server` downloads a mongod binary on first use. In a sandbox
 * that blocks fastdl.mongodb.org this fails; the failure is re-raised with a
 * pointer to `MONGOMS_SYSTEM_BINARY` so the cause is obvious rather than
 * surfacing as a confusing connection timeout.
 */

let server: MongoMemoryServer | undefined;

beforeAll(async () => {
  try {
    server = await MongoMemoryServer.create();
  } catch (error) {
    throw new Error(
      "Could not start an in-memory MongoDB.\n\n" +
        "mongodb-memory-server needs to download a mongod binary from " +
        "fastdl.mongodb.org, which is unreachable here.\n" +
        "If you already have MongoDB installed, point the tests at it:\n" +
        "  MONGOMS_SYSTEM_BINARY=$(which mongod) npm test\n\n" +
        `Original error: ${(error as Error).message}`,
    );
  }

  process.env.MONGODB_URI = server.getUri("rentfinder-test");

  // Deterministic values the tests rely on.
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-to-be-accepted!!";
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  process.env.PLATFORM_COMMISSION_PERCENT = "10";
  process.env.PAYMENT_INCLUDE_DEPOSIT = "false";

  // Admin seeding is exercised explicitly, so it is off by default.
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
});

afterAll(async () => {
  const { disconnectDB } = await import("@/lib/db");
  await disconnectDB();
  await server?.stop();
});
