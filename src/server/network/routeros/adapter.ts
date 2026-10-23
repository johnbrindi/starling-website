import type {
  ActiveSession,
  HealthResult,
  ManagedUser,
  NetworkAdapter,
  ProfileInput,
  ProvisionInput,
  ValidationCheck,
} from "../types";
import { MANAGED_COMMENT_PREFIX } from "../types";
import { RouterOsTrap, withRouter, type RouterOsClient, type RouterOsConfig } from "./client";
import { formatDuration, parseDuration, scriptSafe } from "./protocol";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "+01:00" / "-05:30" -> offset in minutes. */
export function parseGmtOffset(value: string | undefined): number {
  const m = value?.match(/^([+-])(\d{1,2}):?(\d{2})$/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -minutes : minutes;
}

/** Converts a UTC instant to the router's local clock in RouterOS v6 scheduler format. */
export function toRouterDateTime(utc: Date, gmtOffsetMinutes: number) {
  const local = new Date(utc.getTime() + gmtOffsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${MONTHS[local.getUTCMonth()]}/${pad(local.getUTCDate())}/${local.getUTCFullYear()}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`,
  };
}

const schedulerName = (username: string) => `starling-exp-${scriptSafe(username)}`;

/**
 * MikroTik HotSpot via the RouterOS API (v6.43+). Users are local hotspot users tagged with a
 * "starling:" comment so the platform never touches users it did not create.
 */
export class RouterOsAdapter implements NetworkAdapter {
  readonly kind = "routeros" as const;
  readonly simulated = false;

  constructor(
    private readonly cfg: RouterOsConfig,
    private readonly hotspotServer: string,
    private readonly run: <T>(fn: (c: RouterOsClient) => Promise<T>) => Promise<T> = (fn) => withRouter(cfg, fn),
  ) {}

  async health(): Promise<HealthResult> {
    const started = Date.now();
    try {
      const res = await this.run((c) => c.exec("/system/resource/print"));
      const r = res[0] ?? {};
      return {
        ok: true,
        kind: this.kind,
        simulated: false,
        latencyMs: Date.now() - started,
        version: r.version,
        board: r["board-name"],
        uptime: r.uptime,
        cpuLoad: r["cpu-load"] ? Number(r["cpu-load"]) : undefined,
        freeMemoryBytes: r["free-memory"] ? Number(r["free-memory"]) : undefined,
      };
    } catch (err) {
      return { ok: false, kind: this.kind, simulated: false, latencyMs: Date.now() - started, error: (err as Error).message };
    }
  }

  async provisionUser(input: ProvisionInput): Promise<void> {
    const username = scriptSafe(input.username);
    await this.run(async (c) => {
      const attrs = {
        name: username,
        password: input.password,
        server: this.hotspotServer,
        profile: input.profile ?? "default",
        "limit-uptime": formatDuration(input.limitUptimeSeconds),
        "limit-bytes-total": input.limitBytesTotal !== null ? input.limitBytesTotal.toString() : "0",
        comment: `${MANAGED_COMMENT_PREFIX}${input.credentialId}`,
        disabled: false,
      };
      const existing = await c.exec("/ip/hotspot/user/print", { ".proplist": ".id" }, [`?name=${username}`]);
      if (existing[0]?.[".id"]) {
        await c.exec("/ip/hotspot/user/set", { ".id": existing[0][".id"], ...attrs });
      } else {
        await c.exec("/ip/hotspot/user/add", attrs);
      }
      // Confirm the router really has the user before reporting success.
      const check = await c.exec("/ip/hotspot/user/print", { ".proplist": ".id,name,disabled" }, [`?name=${username}`]);
      if (!check[0] || check[0].disabled === "true") throw new Error("Router did not confirm the hotspot user");

      if (input.routerSideExpiry) await this.upsertExpiryScheduler(c, username, input.validUntil);
    });
  }

  /** Router-side backstop: removes the user at expiry even if the server cannot reach the router. */
  private async upsertExpiryScheduler(c: RouterOsClient, username: string, validUntil: Date) {
    const clock = (await c.exec("/system/clock/print"))[0] ?? {};
    const { date, time } = toRouterDateTime(validUntil, parseGmtOffset(clock["gmt-offset"]));
    const name = schedulerName(username);
    const onEvent = [
      `/ip hotspot active remove [find user="${username}"]`,
      `/ip hotspot user remove [find name="${username}"]`,
      `/system scheduler remove [find name="${name}"]`,
    ].join("; ");
    const attrs = {
      "start-date": date,
      "start-time": time,
      interval: "0s",
      "on-event": onEvent,
      policy: "read,write,test",
      comment: `${MANAGED_COMMENT_PREFIX}expiry`,
    };
    const existing = await c.exec("/system/scheduler/print", { ".proplist": ".id" }, [`?name=${name}`]);
    if (existing[0]?.[".id"]) await c.exec("/system/scheduler/set", { ".id": existing[0][".id"], ...attrs });
    else await c.exec("/system/scheduler/add", { name, ...attrs });
  }

  async removeUser(username: string): Promise<void> {
    const name = scriptSafe(username);
    await this.run(async (c) => {
      await this.kick(c, name);
      const users = await c.exec("/ip/hotspot/user/print", { ".proplist": ".id,comment" }, [`?name=${name}`]);
      for (const u of users) {
        // Never remove users that this platform does not manage.
        if (u[".id"] && u.comment?.startsWith(MANAGED_COMMENT_PREFIX)) await c.exec("/ip/hotspot/user/remove", { ".id": u[".id"] });
      }
      const sched = await c.exec("/system/scheduler/print", { ".proplist": ".id" }, [`?name=${schedulerName(name)}`]);
      for (const s of sched) if (s[".id"]) await c.exec("/system/scheduler/remove", { ".id": s[".id"] });
    });
  }

  private async kick(c: RouterOsClient, username: string): Promise<number> {
    const active = await c.exec("/ip/hotspot/active/print", { ".proplist": ".id" }, [`?user=${username}`]);
    let n = 0;
    for (const a of active) {
      if (!a[".id"]) continue;
      try {
        await c.exec("/ip/hotspot/active/remove", { ".id": a[".id"] });
        n++;
      } catch (err) {
        // The session may have ended between print and remove.
        if (!(err instanceof RouterOsTrap)) throw err;
      }
    }
    return n;
  }

  async disconnectUser(username: string): Promise<number> {
    return this.run((c) => this.kick(c, scriptSafe(username)));
  }

  async listActiveSessions(): Promise<ActiveSession[]> {
    const rows = await this.run((c) =>
      c.exec("/ip/hotspot/active/print", { ".proplist": ".id,user,address,mac-address,uptime,bytes-in,bytes-out" }),
    );
    return rows
      .filter((r) => r[".id"] && r.user)
      .map((r) => ({
        externalId: r[".id"]!,
        username: r.user!,
        ipAddress: r.address ?? null,
        macAddress: r["mac-address"] ?? null,
        uptimeSeconds: parseDuration(r.uptime),
        bytesIn: BigInt(r["bytes-in"] ?? "0"),
        bytesOut: BigInt(r["bytes-out"] ?? "0"),
      }));
  }

  async listManagedUsers(): Promise<ManagedUser[]> {
    const rows = await this.run((c) =>
      c.exec("/ip/hotspot/user/print", { ".proplist": "name,profile,disabled,comment,bytes-in,bytes-out,uptime" }),
    );
    return rows
      .filter((r) => r.comment?.startsWith(MANAGED_COMMENT_PREFIX) && r.name)
      .map((r) => ({
        username: r.name!,
        profile: r.profile ?? null,
        disabled: r.disabled === "true",
        bytesIn: BigInt(r["bytes-in"] ?? "0"),
        bytesOut: BigInt(r["bytes-out"] ?? "0"),
        uptimeSeconds: parseDuration(r.uptime),
      }));
  }

  async syncProfile(p: ProfileInput): Promise<void> {
    const name = scriptSafe(p.name);
    await this.run(async (c) => {
      const attrs = {
        "rate-limit": p.rateLimit ?? "",
        "shared-users": p.sharedUsers,
        "idle-timeout": p.idleTimeout ?? "none",
      };
      const existing = await c.exec("/ip/hotspot/user/profile/print", { ".proplist": ".id" }, [`?name=${name}`]);
      if (existing[0]?.[".id"]) await c.exec("/ip/hotspot/user/profile/set", { ".id": existing[0][".id"], ...attrs });
      else await c.exec("/ip/hotspot/user/profile/add", { name, ...attrs });
    });
  }

  /** Read-only checks. Never changes router configuration. */
  async validateConfiguration(expected: { profiles: string[]; portalHost: string }): Promise<ValidationCheck[]> {
    return this.run(async (c) => {
      const checks: ValidationCheck[] = [];
      const res = (await c.exec("/system/resource/print"))[0] ?? {};
      const version = res.version ?? "unknown";
      const major = Number(version.split(".")[0]);
      const minor = Number(version.split(".")[1]);
      checks.push({
        name: "RouterOS version",
        ok: major > 6 || (major === 6 && minor >= 43),
        severity: "error",
        detail: `${version} on ${res["board-name"] ?? "unknown board"} (API login requires 6.43+)`,
      });
      const servers = await c.exec("/ip/hotspot/print", { ".proplist": "name,interface,disabled,profile" });
      const server = servers.find((s) => s.name === this.hotspotServer);
      checks.push({
        name: `HotSpot server "${this.hotspotServer}"`,
        ok: !!server && server.disabled !== "true",
        severity: "error",
        detail: server ? `interface ${server.interface}, profile ${server.profile}${server.disabled === "true" ? " (DISABLED)" : ""}` : `Not found. Servers: ${servers.map((s) => s.name).join(", ") || "none"}`,
      });
      const profiles = await c.exec("/ip/hotspot/user/profile/print", { ".proplist": "name" });
      const names = new Set(profiles.map((p) => p.name));
      for (const p of expected.profiles) {
        checks.push({ name: `User profile "${p}"`, ok: names.has(p), severity: "warning", detail: names.has(p) ? "Present" : "Missing (run profile sync)" });
      }
      const walledIp = await c.exec("/ip/hotspot/walled-garden/ip/print", { ".proplist": "dst-host,action,disabled" });
      const walled = await c.exec("/ip/hotspot/walled-garden/print", { ".proplist": "dst-host,action,disabled" });
      const hosts = [...walledIp, ...walled].filter((w) => w.disabled !== "true" && w.action !== "deny").map((w) => w["dst-host"] ?? "");
      const portalAllowed = hosts.some((h) => h === expected.portalHost || (h.startsWith("*") && expected.portalHost.endsWith(h.slice(1))));
      checks.push({
        name: "Walled garden allows the portal",
        ok: portalAllowed,
        severity: "error",
        detail: portalAllowed ? `${expected.portalHost} is allowed before login` : `Add ${expected.portalHost} to /ip hotspot walled-garden ip`,
      });
      const ntp = (await c.exec("/system/ntp/client/print"))[0] ?? {};
      checks.push({
        name: "Router clock (NTP)",
        ok: ntp.enabled === "true",
        severity: "warning",
        detail: ntp.enabled === "true" ? `NTP client enabled (${ntp.status ?? "status unknown"})` : "Enable the NTP client so router-side expiry runs on time",
      });
      const services = await c.exec("/ip/service/print", { ".proplist": "name,disabled,port,address" });
      const apiSsl = services.find((s) => s.name === "api-ssl");
      const api = services.find((s) => s.name === "api");
      checks.push({
        name: "API service restricted",
        ok: !!(apiSsl?.address || api?.address),
        severity: "warning",
        detail: `api: ${api?.disabled === "true" ? "disabled" : `enabled, allowed from ${api?.address || "ANY"}`}; api-ssl: ${apiSsl?.disabled === "true" ? "disabled" : `enabled, allowed from ${apiSsl?.address || "ANY"}`}`,
      });
      return checks;
    });
  }
}
