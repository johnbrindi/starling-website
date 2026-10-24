import type { PrismaClient } from "@/generated/prisma/client";
import type { HealthResult, ManagedUser, NetworkAdapter, ValidationCheck } from "./types";

/**
 * "Router pull" mode for routers the server cannot reach (Starlink CGNAT, no VPN):
 * a RouterOS scheduler polls GET /api/router/pull every few seconds, creates/removes the hotspot users
 * it receives, and confirms them on the next poll. The server never connects to the router.
 * Expiry is enforced on the router by the package profiles' on-login timer, and by "delete" commands
 * the server queues when a credential expires or is revoked.
 */
export class RouterPullAdapter implements NetworkAdapter {
  readonly kind = "routerpull" as const;
  readonly simulated = false;
  readonly deferred = true;

  constructor(private readonly db: PrismaClient) {}

  async health(): Promise<HealthResult> {
    const s = await this.db.integrationStatus.findUnique({ where: { key: "router-pull" } });
    const age = s ? Date.now() - s.checkedAt.getTime() : Infinity;
    const ok = age < 120_000;
    return {
      ok,
      kind: this.kind,
      simulated: false,
      latencyMs: 0,
      error: ok ? undefined : s ? `Router last checked in ${Math.round(age / 1000)} s ago` : "The router has never checked in",
    };
  }

  // The router applies changes itself; these are never called for a deferred adapter.
  async provisionUser(): Promise<void> {}
  async removeUser(): Promise<void> {}
  async disconnectUser(): Promise<number> {
    return 0;
  }
  async listActiveSessions() {
    return [];
  }
  async listManagedUsers(): Promise<ManagedUser[]> {
    return [];
  }
  async syncProfile(): Promise<void> {}

  async validateConfiguration(): Promise<ValidationCheck[]> {
    const h = await this.health();
    return [{ name: "Router checks in (/api/router/pull)", ok: h.ok, severity: "error", detail: h.ok ? "Router polled in the last 2 minutes" : (h.error ?? "") }];
  }
}
