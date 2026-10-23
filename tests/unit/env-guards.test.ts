import { afterEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "@/server/env";

const original = { ...process.env };
function withEnv(patch: Record<string, string>) {
  process.env = { ...original, ...patch };
  resetEnvCache();
  return () => env();
}

describe("environment guards", () => {
  afterEach(() => {
    process.env = { ...original };
    resetEnvCache();
  });

  const prod = { NODE_ENV: "production", APP_URL: "https://wifi.example.cm", ALLOW_SIMULATED_PAYMENTS: "false", ALLOW_FAKE_NETWORK: "false" };
  const real = {
    PAYMENT_PROVIDER: "notchpay",
    NOTCHPAY_PUBLIC_KEY: "pk_live_x",
    NOTCHPAY_WEBHOOK_HASH: "hsk_live_x",
    NETWORK_ADAPTER: "routeros",
    ROUTER_HOST: "10.10.10.2",
    ROUTER_USERNAME: "starling-api",
    ROUTER_PASSWORD: "router-password",
  };

  it("refuses the payment simulator in production", () => {
    expect(withEnv({ ...prod, ...real, PAYMENT_PROVIDER: "simulator" })).toThrow(/simulator is forbidden in production/);
  });

  it("refuses ALLOW_SIMULATED_PAYMENTS in production even with a real provider", () => {
    expect(withEnv({ ...prod, ...real, ALLOW_SIMULATED_PAYMENTS: "true" })).toThrow(/forbidden in production/);
  });

  it("refuses the fake router in production", () => {
    expect(withEnv({ ...prod, ...real, NETWORK_ADAPTER: "fake" })).toThrow(/fake network adapter is forbidden/);
  });

  it("requires https in production", () => {
    expect(withEnv({ ...prod, ...real, APP_URL: "http://wifi.example.cm" })).toThrow(/https/);
  });

  it("requires router credentials for the routeros adapter", () => {
    expect(withEnv({ ...prod, ...real, ROUTER_PASSWORD: "" })).toThrow(/ROUTER_PASSWORD/);
  });

  it("accepts a correct production configuration", () => {
    expect(withEnv({ ...prod, ...real })().NETWORK_ADAPTER).toBe("routeros");
  });

  it("requires an explicit opt-in for simulation in development", () => {
    expect(withEnv({ NODE_ENV: "development", ALLOW_SIMULATED_PAYMENTS: "false" })).toThrow(/ALLOW_SIMULATED_PAYMENTS/);
  });
});
