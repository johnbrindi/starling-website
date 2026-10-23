import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SentenceParser, decodeLength, encodeLength, encodeSentence, formatDuration, parseDuration, scriptSafe } from "@/server/network/routeros/protocol";
import { RouterOsAdapter, parseGmtOffset, toRouterDateTime } from "@/server/network/routeros/adapter";
import { RouterOsClient } from "@/server/network/routeros/client";
import { NetworkUnavailableError } from "@/server/network/types";
import { FakeRouterOsServer } from "../helpers/fake-routeros-server";

describe("RouterOS wire protocol", () => {
  it.each([0, 1, 0x7f, 0x80, 0x3fff, 0x4000, 0x1fffff, 0x200000, 0xfffffff, 0x10000000])("round-trips length %i", (n) => {
    const enc = encodeLength(n);
    expect(decodeLength(enc, 0)).toEqual({ length: n, size: enc.length });
  });

  it("parses sentences split across arbitrary TCP chunks", () => {
    const bytes = Buffer.concat([encodeSentence(["!re", "=name=ABC", ".tag=1"]), encodeSentence(["!done", ".tag=1"])]);
    const parser = new SentenceParser();
    const out: string[][] = [];
    for (let i = 0; i < bytes.length; i += 3) out.push(...parser.push(bytes.subarray(i, i + 3)));
    expect(out).toEqual([["!re", "=name=ABC", ".tag=1"], ["!done", ".tag=1"]]);
  });

  it("parses and formats RouterOS durations", () => {
    expect(parseDuration("1w2d03:04:05")).toBe(7 * 86400 + 2 * 86400 + 3 * 3600 + 4 * 60 + 5);
    expect(parseDuration("1h2m3s")).toBe(3723);
    expect(parseDuration("4m5s")).toBe(245);
    expect(formatDuration(3600)).toBe("01:00:00");
    expect(formatDuration(90061)).toBe("1d01:01:01");
  });

  it("refuses values that could inject into router scripts", () => {
    expect(scriptSafe("K7M4QX2P")).toBe("K7M4QX2P");
    expect(() => scriptSafe('a"; /system reset-configuration')).toThrow();
  });

  it("converts UTC to router local scheduler time", () => {
    expect(parseGmtOffset("+01:00")).toBe(60);
    expect(toRouterDateTime(new Date("2026-10-22T23:30:00Z"), 60)).toEqual({ date: "oct/23/2026", time: "00:30:00" });
  });
});

describe("RouterOS adapter against a fake router", () => {
  const router = new FakeRouterOsServer();
  let adapter: RouterOsAdapter;
  let port: number;

  beforeAll(async () => {
    port = await router.listen();
    adapter = new RouterOsAdapter({ host: "127.0.0.1", port, username: "api", password: router.password, tls: false, tlsInsecure: false, timeoutMs: 3000 }, "hotspot1");
  });
  afterAll(() => router.close());

  const input = (validUntil = new Date(Date.now() + 3600_000)) => ({
    credentialId: "cred1",
    username: "K7M4QX2P",
    password: "K7M4QX2P",
    profile: "starling-1h",
    validUntil,
    limitUptimeSeconds: 3600,
    limitBytesTotal: null,
    maxDevices: 1,
    rateLimit: null,
    routerSideExpiry: true,
  });

  it("reports health with version and board", async () => {
    const h = await adapter.health();
    expect(h.ok).toBe(true);
    expect(h.version).toContain("6.48.6");
    expect(h.board).toBe("hAP lite");
  });

  it("rejects bad credentials", async () => {
    const c = new RouterOsClient({ host: "127.0.0.1", port, username: "api", password: "wrong", tls: false, tlsInsecure: false, timeoutMs: 3000 });
    await expect(c.connect()).rejects.toThrow(/invalid user name or password/);
    c.close();
  });

  it("provisions idempotently (add then set) with a managed comment and a router-side expiry scheduler", async () => {
    await adapter.provisionUser(input());
    await adapter.provisionUser(input(new Date(Date.now() + 7200_000)));
    const users = router.tables["/ip/hotspot/user"]!.filter((u) => u.name === "K7M4QX2P");
    expect(users).toHaveLength(1);
    expect(users[0]!.comment).toBe("starling:cred1");
    expect(users[0]!.server).toBe("hotspot1");
    expect(users[0]!["limit-uptime"]).toBe("01:00:00");
    const sched = router.tables["/system/scheduler"]!;
    expect(sched).toHaveLength(1);
    expect(sched[0]!.name).toBe("starling-exp-K7M4QX2P");
    expect(sched[0]!["on-event"]).toContain('/ip hotspot user remove [find name="K7M4QX2P"]');
  });

  it("lists sessions, disconnects and removes only managed users", async () => {
    router.tables["/ip/hotspot/active"]!.push(
      { ".id": "*A1", user: "K7M4QX2P", address: "10.5.50.20", "mac-address": "AA:BB:CC:DD:EE:01", uptime: "5m10s", "bytes-in": "1000", "bytes-out": "5000" },
      { ".id": "*A2", user: "admin-user", address: "10.5.50.21", "mac-address": "AA:BB:CC:DD:EE:02", uptime: "1h", "bytes-in": "1", "bytes-out": "1" },
    );
    const sessions = await adapter.listActiveSessions();
    expect(sessions.find((s) => s.username === "K7M4QX2P")).toMatchObject({ uptimeSeconds: 310, bytesOut: 5000n });
    const managed = await adapter.listManagedUsers();
    expect(managed.map((u) => u.username)).toEqual(["K7M4QX2P"]);

    await adapter.removeUser("K7M4QX2P");
    expect(router.tables["/ip/hotspot/user"]!.map((u) => u.name)).toEqual(["admin-user"]);
    expect(router.tables["/ip/hotspot/active"]!.map((a) => a.user)).toEqual(["admin-user"]);
    expect(router.tables["/system/scheduler"]).toHaveLength(0);
    await adapter.removeUser("K7M4QX2P"); // idempotent
    await adapter.removeUser("admin-user"); // not managed: left alone
    expect(router.tables["/ip/hotspot/user"]!.map((u) => u.name)).toEqual(["admin-user"]);
  });

  it("syncs profiles and validates configuration read-only", async () => {
    await adapter.syncProfile({ name: "starling-1h", rateLimit: "2M/5M", sharedUsers: 1, idleTimeout: "10m" });
    const before = JSON.stringify(router.tables);
    const checks = await adapter.validateConfiguration({ profiles: ["starling-1h", "missing"], portalHost: "wifi.example.cm" });
    expect(JSON.stringify(router.tables)).toBe(before);
    const byName = Object.fromEntries(checks.map((c) => [c.name, c.ok]));
    expect(byName["RouterOS version"]).toBe(true);
    expect(byName['HotSpot server "hotspot1"']).toBe(true);
    expect(byName['User profile "starling-1h"']).toBe(true);
    expect(byName['User profile "missing"']).toBe(false);
    expect(byName["Walled garden allows the portal"]).toBe(true);
  });

  it("surfaces an unreachable router as NetworkUnavailableError", async () => {
    const down = new RouterOsAdapter({ host: "127.0.0.1", port: 1, username: "api", password: "x", tls: false, tlsInsecure: false, timeoutMs: 1000 }, "hotspot1");
    await expect(down.provisionUser(input())).rejects.toBeInstanceOf(NetworkUnavailableError);
    expect((await down.health()).ok).toBe(false);
  });
});
