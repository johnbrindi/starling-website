import type {
  ActiveSession,
  HealthResult,
  ManagedUser,
  NetworkAdapter,
  ProfileInput,
  ProvisionInput,
  ValidationCheck,
} from "./types";
import { NetworkUnavailableError } from "./types";

/** Simulated router state. */
export interface FakeRouterState {
  online: boolean;
  users: Record<string, { password: string; profile: string | null; validUntil: string; limitBytesTotal: string | null; maxDevices: number }>;
  active: Record<string, { username: string; mac: string; ip: string; startedAt: string; bytesIn: string; bytesOut: string }>;
  profiles: Record<string, ProfileInput>;
  nextId: number;
}

export interface FakeStateStore {
  load(): Promise<FakeRouterState>;
  save(state: FakeRouterState): Promise<void>;
}

export function emptyFakeState(): FakeRouterState {
  return { online: true, users: {}, active: {}, profiles: {}, nextId: 1 };
}

export class MemoryFakeStore implements FakeStateStore {
  state = emptyFakeState();
  async load() {
    return this.state;
  }
  async save(s: FakeRouterState) {
    this.state = s;
  }
}

/**
 * Development/test router. Behaves like a MikroTik HotSpot (users, active sessions, profiles)
 * and can simulate outages. Clearly reports itself as simulated; forbidden in production by env validation.
 */
export class FakeNetworkAdapter implements NetworkAdapter {
  readonly kind = "fake" as const;
  readonly simulated = true;

  constructor(private readonly store: FakeStateStore) {}

  private async state(): Promise<FakeRouterState> {
    const s = await this.store.load();
    if (!s.online) throw new NetworkUnavailableError("Simulated router is offline");
    return s;
  }

  async setOnline(online: boolean) {
    const s = await this.store.load();
    s.online = online;
    await this.store.save(s);
  }

  async health(): Promise<HealthResult> {
    const s = await this.store.load();
    return {
      ok: s.online,
      kind: this.kind,
      simulated: true,
      latencyMs: 1,
      version: "6.48.6 (long-term) [simulated]",
      board: "hAP lite (simulated)",
      error: s.online ? undefined : "Simulated router is offline",
    };
  }

  async provisionUser(input: ProvisionInput) {
    const s = await this.state();
    s.users[input.username] = {
      password: input.password,
      profile: input.profile,
      validUntil: input.validUntil.toISOString(),
      limitBytesTotal: input.limitBytesTotal?.toString() ?? null,
      maxDevices: input.maxDevices,
    };
    await this.store.save(s);
  }

  async removeUser(username: string) {
    const s = await this.state();
    delete s.users[username];
    for (const [id, a] of Object.entries(s.active)) if (a.username === username) delete s.active[id];
    await this.store.save(s);
  }

  async disconnectUser(username: string) {
    const s = await this.state();
    let n = 0;
    for (const [id, a] of Object.entries(s.active)) {
      if (a.username === username) {
        delete s.active[id];
        n++;
      }
    }
    await this.store.save(s);
    return n;
  }

  /** Simulates a device logging in on the hotspot. Enforces what a real router would. */
  async simulateLogin(username: string, password: string, mac: string, ip: string): Promise<{ ok: boolean; reason?: string }> {
    const s = await this.state();
    const user = s.users[username];
    if (!user || user.password !== password) return { ok: false, reason: "invalid username or password" };
    if (new Date(user.validUntil) <= new Date()) return { ok: false, reason: "user expired" };
    const sessions = Object.values(s.active).filter((a) => a.username === username);
    if (sessions.some((a) => a.mac === mac)) return { ok: true };
    if (sessions.length >= user.maxDevices) return { ok: false, reason: "no more sessions are allowed for user" };
    s.active[`*${(s.nextId++).toString(16).toUpperCase()}`] = {
      username,
      mac,
      ip,
      startedAt: new Date().toISOString(),
      bytesIn: "0",
      bytesOut: "0",
    };
    await this.store.save(s);
    return { ok: true };
  }

  async listActiveSessions(): Promise<ActiveSession[]> {
    const s = await this.state();
    return Object.entries(s.active).map(([id, a]) => ({
      externalId: id,
      username: a.username,
      macAddress: a.mac,
      ipAddress: a.ip,
      uptimeSeconds: Math.floor((Date.now() - new Date(a.startedAt).getTime()) / 1000),
      bytesIn: BigInt(a.bytesIn),
      bytesOut: BigInt(a.bytesOut),
    }));
  }

  async listManagedUsers(): Promise<ManagedUser[]> {
    const s = await this.state();
    return Object.entries(s.users).map(([username, u]) => ({
      username,
      profile: u.profile,
      disabled: false,
      bytesIn: 0n,
      bytesOut: 0n,
      uptimeSeconds: 0,
    }));
  }

  async syncProfile(profile: ProfileInput) {
    const s = await this.state();
    s.profiles[profile.name] = profile;
    await this.store.save(s);
  }

  async validateConfiguration(expected: { profiles: string[]; portalHost: string }): Promise<ValidationCheck[]> {
    const s = await this.store.load();
    return [
      { name: "Adapter mode", ok: true, severity: "warning", detail: "Simulated router. No real network is being controlled." },
      { name: "Router reachable", ok: s.online, severity: "error", detail: s.online ? "Simulated router online" : "Simulated outage" },
      ...expected.profiles.map((p) => ({
        name: `Profile "${p}"`,
        ok: p in s.profiles,
        severity: "warning" as const,
        detail: p in s.profiles ? "Present" : "Missing (run profile sync)",
      })),
    ];
  }
}
