import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? "postgresql://starling:starling_dev_only@127.0.0.1:54329/starling_e2e";

// End-to-end tests run the real app (dev server) against an isolated database, with the payment
// simulator and fake router. They never touch a production database or a real router.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Uses the locally installed Google Chrome; run `npx playwright install chromium` if absent.
    channel: process.env.PW_CHANNEL ?? "chrome",
  },
  projects: [{ name: "mobile-chrome", use: { ...devices["Pixel 7"], channel: process.env.PW_CHANNEL ?? "chrome" } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      NODE_ENV: "development",
      PAYMENT_PROVIDER: "simulator",
      ALLOW_SIMULATED_PAYMENTS: "true",
      NETWORK_ADAPTER: "fake",
      ALLOW_FAKE_NETWORK: "true",
    },
  },
});
