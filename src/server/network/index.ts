import "server-only";
import { db } from "../db";
import { env } from "../env";
import { FakeNetworkAdapter, emptyFakeState, type FakeRouterState, type FakeStateStore } from "./fake";
import { RadiusAdapter } from "./radius/adapter";
import { RouterOsAdapter } from "./routeros/adapter";
import type { NetworkAdapter } from "./types";

const FAKE_STATE_KEY = "dev:fake-router";

/** Fake router state persisted in the Setting table so the web app and worker share it. */
class DbFakeStore implements FakeStateStore {
  async load(): Promise<FakeRouterState> {
    const row = await db.setting.findUnique({ where: { key: FAKE_STATE_KEY } });
    return (row?.value as unknown as FakeRouterState) ?? emptyFakeState();
  }
  async save(state: FakeRouterState) {
    const value = JSON.parse(JSON.stringify(state));
    await db.setting.upsert({ where: { key: FAKE_STATE_KEY }, create: { key: FAKE_STATE_KEY, value }, update: { value } });
  }
}

let override: NetworkAdapter | undefined;
let cached: NetworkAdapter | undefined;

/** Tests inject an adapter here. */
export function setNetworkAdapter(adapter: NetworkAdapter | undefined) {
  override = adapter;
}

export function getNetworkAdapter(): NetworkAdapter {
  if (override) return override;
  if (cached) return cached;
  const e = env(); // env() already refuses fake mode in production.
  switch (e.NETWORK_ADAPTER) {
    case "routeros":
      cached = new RouterOsAdapter(
        {
          host: e.ROUTER_HOST!,
          port: e.ROUTER_PORT,
          username: e.ROUTER_USERNAME!,
          password: e.ROUTER_PASSWORD!,
          tls: e.ROUTER_TLS,
          tlsInsecure: e.ROUTER_TLS_INSECURE,
          timeoutMs: e.ROUTER_TIMEOUT_MS,
        },
        e.ROUTER_HOTSPOT_SERVER,
      );
      break;
    case "radius":
      cached = new RadiusAdapter(db, { host: e.RADIUS_NAS_HOST!, port: e.RADIUS_COA_PORT, secret: e.RADIUS_SECRET! });
      break;
    case "fake":
      cached = new FakeNetworkAdapter(new DbFakeStore());
      break;
  }
  return cached;
}

export * from "./types";
