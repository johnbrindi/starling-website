/** Self-contained environment for end-to-end runs (test-only secrets; never used outside local e2e). */
export const E2E_PORT = 3100;
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://starling:starling_dev_only@127.0.0.1:54329/starling_e2e";

export const E2E_ENV = {
  NODE_ENV: "development",
  DATABASE_URL: E2E_DATABASE_URL,
  APP_URL: `http://localhost:${E2E_PORT}`,
  SESSION_SECRET: "e2e-session-secret-e2e-session-secret-0123456789",
  ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
  CRON_SECRET: "e2e-cron-secret-0123456789abcdef",
  PAYMENT_PROVIDER: "simulator",
  ALLOW_SIMULATED_PAYMENTS: "true",
  NETWORK_ADAPTER: "fake",
  ALLOW_FAKE_NETWORK: "true",
} as const;
