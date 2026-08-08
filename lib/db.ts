import mongoose from "mongoose";
import { env } from "./env";

/**
 * Serverless-safe Mongoose connection.
 *
 * On Vercel each lambda invocation may reuse a warm container, so the
 * connection (and the in-flight promise) is cached on `globalThis`. Without the
 * cache every request would open a new pool and exhaust Atlas connections.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _rfMongoose: MongooseCache | undefined;
}

const cache: MongooseCache = globalThis._rfMongoose ?? {
  conn: null,
  promise: null,
};
globalThis._rfMongoose = cache;

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(env.mongodbUri, {
        // Fail fast rather than hanging a lambda until the platform timeout.
        serverSelectionTimeoutMS: 10_000,
        // Buffering hides connection errors behind confusing timeouts.
        bufferCommands: false,
        maxPoolSize: 10,
      })
      .catch((error) => {
        // Clear the cached promise so a later request can retry instead of
        // permanently reusing a rejected promise.
        cache.promise = null;
        throw error;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

/** True when the driver reports an active connection. */
export function isConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/** Used by the test suite and seed script to shut down cleanly. */
export async function disconnectDB(): Promise<void> {
  if (cache.conn) {
    await mongoose.disconnect();
    cache.conn = null;
    cache.promise = null;
  }
}
