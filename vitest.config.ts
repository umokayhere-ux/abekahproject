import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Two projects:
 *
 *  - `unit` covers pure logic (money splits, validation, JWTs, webhook
 *    signatures) and needs nothing external, so it always runs.
 *  - `integration` exercises the route handlers against a real in-memory
 *    MongoDB, which requires downloading a mongod binary on first run.
 *
 * `npm test` runs both; `npm run test:unit` runs only the self-contained half.
 */
const alias = { "@": fileURLToPath(new URL(".", import.meta.url)) };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/unit-setup.ts"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup.ts"],
          // These share one database, so they must not run in parallel
          // processes that would each get their own instance.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
