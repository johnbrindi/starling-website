// Network adapter contract. Business logic only talks to this interface, never to a router directly.

export type NetworkAdapterKind = "fake" | "routeros" | "radius";

/** Every user the platform manages on the router carries this comment prefix. */
export const MANAGED_COMMENT_PREFIX = "starling:";

export interface ProvisionInput {
  username: string;
  password: string;
  /** Router hotspot user profile (rate limit, shared users, idle timeout). */
  profile: string | null;
  validUntil: Date;
  /** Backstop: remaining wall-clock seconds; router counts only connected time, so this never cuts early. */
  limitUptimeSeconds: number;
  limitBytesTotal: bigint | null;
  maxDevices: number;
  rateLimit: string | null;
  /** Install a router-side scheduler that removes the user at validUntil (works if the server is unreachable). */
  routerSideExpiry: boolean;
  credentialId: string;
}

export interface ActiveSession {
  externalId: string;
  username: string;
  macAddress: string | null;
  ipAddress: string | null;
  uptimeSeconds: number;
  bytesIn: bigint;
  bytesOut: bigint;
}

export interface ManagedUser {
  username: string;
  profile: string | null;
  disabled: boolean;
  bytesIn: bigint;
  bytesOut: bigint;
  uptimeSeconds: number;
}

export interface ProfileInput {
  name: string;
  rateLimit: string | null;
  sharedUsers: number;
  idleTimeout: string | null;
  /** Long keepalive (e.g. "3h") keeps a silent device's slot so one login cannot hop between phones. */
  keepaliveTimeout: string | null;
  statusAutorefresh: string | null;
}

export interface HealthResult {
  ok: boolean;
  kind: NetworkAdapterKind;
  simulated: boolean;
  latencyMs: number;
  version?: string;
  board?: string;
  uptime?: string;
  cpuLoad?: number;
  freeMemoryBytes?: number;
  error?: string;
}

export interface ValidationCheck {
  name: string;
  ok: boolean;
  detail: string;
  severity: "error" | "warning" | "info";
}

export interface NetworkAdapter {
  readonly kind: NetworkAdapterKind;
  readonly simulated: boolean;
  health(): Promise<HealthResult>;
  /** Idempotent create-or-update. Must throw if the router did not confirm. */
  provisionUser(input: ProvisionInput): Promise<void>;
  /** Idempotent: removing a missing user succeeds. Also ends the user's active sessions. */
  removeUser(username: string): Promise<void>;
  /** Kicks every active session of the user. Returns how many were disconnected. */
  disconnectUser(username: string): Promise<number>;
  listActiveSessions(): Promise<ActiveSession[]>;
  listManagedUsers(): Promise<ManagedUser[]>;
  syncProfile(profile: ProfileInput): Promise<void>;
  /**
   * Optional: keep the router's own "time left" equal to the real expiry (so the hotspot status page
   * shows the right countdown). Returns how many users were adjusted.
   */
  alignTimeLeft?(items: { username: string; validUntil: Date }[]): Promise<number>;
  validateConfiguration(expected: { profiles: string[]; portalHost: string }): Promise<ValidationCheck[]>;
}

export class NetworkUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkUnavailableError";
  }
}
