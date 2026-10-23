import type { PrismaClient } from "@/generated/prisma/client";
import type {
  ActiveSession,
  HealthResult,
  ManagedUser,
  NetworkAdapter,
  ProfileInput,
  ProvisionInput,
  ValidationCheck,
} from "../types";
import { sendDisconnect } from "./coa";

/**
 * MikroTik HotSpot + FreeRADIUS. FreeRADIUS reads entitlements directly from SQL views over the
 * AccessCredential table (network/radius/schema.sql), so "provisioning" is a database fact:
 * an entitled credential is visible to RADIUS, an expired one is not. Disconnects use RFC 5176.
 */
export class RadiusAdapter implements NetworkAdapter {
  readonly kind = "radius" as const;
  readonly simulated = false;

  constructor(
    private readonly db: PrismaClient,
    private readonly nas: { host: string; port: number; secret: string },
  ) {}

  async health(): Promise<HealthResult> {
    const started = Date.now();
    try {
      await this.db.$queryRawUnsafe(`SELECT 1 FROM radius.radcheck LIMIT 1`);
      return { ok: true, kind: this.kind, simulated: false, latencyMs: Date.now() - started, version: "FreeRADIUS SQL views" };
    } catch (err) {
      return { ok: false, kind: this.kind, simulated: false, latencyMs: Date.now() - started, error: `RADIUS schema not installed: ${(err as Error).message}` };
    }
  }

  async provisionUser(input: ProvisionInput): Promise<void> {
    const rows = await this.db.$queryRawUnsafe<{ username: string }[]>(
      `SELECT username FROM radius.radcheck WHERE username = $1 AND attribute = 'Cleartext-Password'`,
      input.username,
    );
    if (rows.length === 0) throw new Error("Credential is not visible to RADIUS (not entitled or views missing)");
  }

  async removeUser(username: string): Promise<void> {
    // Expired/revoked credentials disappear from the views automatically; just end live sessions.
    await this.disconnectUser(username);
  }

  async disconnectUser(username: string): Promise<number> {
    const ok = await sendDisconnect(this.nas.host, this.nas.port, username, this.nas.secret);
    return ok ? 1 : 0;
  }

  async listActiveSessions(): Promise<ActiveSession[]> {
    const rows = await this.db.$queryRawUnsafe<
      { acctsessionid: string; username: string; callingstationid: string | null; framedipaddress: string | null; acctsessiontime: number | null; acctinputoctets: bigint | null; acctoutputoctets: bigint | null }[]
    >(
      `SELECT acctsessionid, username, callingstationid, host(framedipaddress) AS framedipaddress, acctsessiontime,
              acctinputoctets, acctoutputoctets
         FROM radius.radacct WHERE acctstoptime IS NULL`,
    );
    return rows.map((r) => ({
      externalId: r.acctsessionid,
      username: r.username,
      macAddress: r.callingstationid,
      ipAddress: r.framedipaddress,
      uptimeSeconds: Number(r.acctsessiontime ?? 0),
      // NAS "input" is upload from the client's point of view.
      bytesIn: BigInt(r.acctinputoctets ?? 0),
      bytesOut: BigInt(r.acctoutputoctets ?? 0),
    }));
  }

  async listManagedUsers(): Promise<ManagedUser[]> {
    const rows = await this.db.$queryRawUnsafe<{ username: string }[]>(
      `SELECT DISTINCT username FROM radius.radcheck WHERE attribute = 'Cleartext-Password'`,
    );
    return rows.map((r) => ({ username: r.username, profile: null, disabled: false, bytesIn: 0n, bytesOut: 0n, uptimeSeconds: 0 }));
  }

  async syncProfile(_profile: ProfileInput): Promise<void> {
    // Rate limits are sent per user as Mikrotik-Rate-Limit by the radreply view.
  }

  async validateConfiguration(): Promise<ValidationCheck[]> {
    const h = await this.health();
    return [
      { name: "RADIUS SQL views", ok: h.ok, severity: "error", detail: h.ok ? "radius.radcheck / radreply / radacct present" : (h.error ?? "") },
      { name: "NAS for disconnects", ok: true, severity: "info", detail: `${this.nas.host}:${this.nas.port} (requires /radius incoming accept=yes)` },
    ];
  }
}
