import { defineConfig, devices } from "@playwright/test";
import { E2E_ENV, E2E_PORT as PORT } from "./tests/e2e/env";

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
    stdout: "ignore",
    timeout: 180_000,
    reuseExistingServer: false,
    env: { ...E2E_ENV },
  },
});
