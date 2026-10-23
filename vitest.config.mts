import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://starling:starling_dev_only@127.0.0.1:54329/starling_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" throws outside React Server Components; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./tests/helpers/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/helpers/global-setup.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    // Integration tests share one database; run files sequentially.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      DATABASE_URL: TEST_DATABASE_URL,
      SESSION_SECRET: "test-session-secret-test-session-secret-0123456789",
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      CRON_SECRET: "test-cron-secret-0123456789abcdef",
      PAYMENT_PROVIDER: "simulator",
      ALLOW_SIMULATED_PAYMENTS: "true",
      NETWORK_ADAPTER: "fake",
      ALLOW_FAKE_NETWORK: "true",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
    },
  },
});
