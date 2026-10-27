import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { encrypt } from "@/server/crypto";
import { routerPull } from "@/server/network/pull";
import { applyRouterReport, parseRouterReport, routerTimeToSeconds } from "@/server/network/report";
import { blockDevice, disconnectLogin, pauseLogin, resumeLogin, setLoginLimits, unblockDevice } from "@/server/network/control";
import { expireDue } from "@/server/subscriptions/service";
import { resetDb, resetOverrides } from "../helpers/fixtures";

let seq = 20000;
async function cred(username: string, over: Record<string, unknown> = {}) {
  const c = await db.customer.create({ data: { phone: `+2376711${seq++}` } });
  return db.accessCredential.create({
    data: { customerId: c.id, username, passwordEnc: encrypt("123456"), validFrom: new Date(Date.now() - 60_000), validUntil: new Date(Date.now() + 3600_000), networkProfileName: "1hour", provisionState: "PROVISIONED", ...over },
  });
}
async function staff() {
  return db.staffUser.create({ data: { email: `s${randomUUID().slice(0, 8)}@t.local`, name: "S", role: "SUPPORT", passwordHash: "x" } });
}
const cmdLines = (body: string) => body.split("\n").filter((l) => l.startsWith("c,"));

describe("router time and report parsing", () => {
  it("reads RouterOS uptime formats", () => {
    expect(routerTimeToSeconds("00:01:05")).toBe(65);
    expect(routerTimeToSeconds("1d02:03:04")).toBe(86400 + 7384);
    expect(routerTimeToSeconds("1w2d00:00:01")).toBe(604800 + 172800 + 1);
    expect(routerTimeToSeconds("1h2m3s")).toBe(3723);
    expect(routerTimeToSeconds("abc")).toBe(-1);
  });

  it("accepts only well-formed device lines", () => {
    const body = ["*1A,abc123,aa:bb:cc:dd:ee:ff,10.5.50.20,00:10:00,1000,2000", "*2,x;rm -rf,AA:BB:CC:DD:EE:FF,10.5.50.21,00:01:00,1,1", "none", "*3,ok1,AA:BB:CC:DD:EE:F1,10.5.50.22,00:01:00,1,1,extra"].join("\n");
    const s = parseRouterReport(body);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ externalId: "*1A", username: "abc123", macAddress: "AA:BB:CC:DD:EE:FF", uptimeSeconds: 600, bytesIn: 1000n });
  });
});

describe("staff device control (router-pull)", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
  });

  it("records online devices from the router report and closes the ones that left", async () => {
    const c = await cred("onl001");
    await applyRouterReport("*1,onl001,AA:BB:CC:DD:EE:01,10.5.50.30,00:05:00,500,1500\n*2,family7,AA:BB:CC:DD:EE:02,10.5.50.31,01:00:00,1,1");
    const open = await db.networkSession.findMany({ where: { endedAt: null }, orderBy: { username: "asc" } });
    expect(open.map((o) => o.username)).toEqual(["family7", "onl001"]);
    expect(open.find((o) => o.username === "onl001")!.credentialId).toBe(c.id);
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: c.id } })).bytesOut).toBe(1500n);
    await applyRouterReport("none");
    expect(await db.networkSession.count({ where: { endedAt: null } })).toBe(0);
    expect((await db.integrationStatus.findUniqueOrThrow({ where: { key: "router-report" } })).ok).toBe(true);
  });

  it("an expired login seen online is removed from the router on the next poll", async () => {
    const c = await cred("exp001", { validUntil: new Date(Date.now() - 1000), status: "EXPIRED" });
    await applyRouterReport("*1,exp001,AA:BB:CC:DD:EE:03,10.5.50.32,00:05:00,1,1");
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: c.id } })).provisionState).toBe("DEPROVISION_PENDING");
    expect((await routerPull([])).body).toContain("d,exp001");
  });

  it("disconnect and block/unblock become router commands, re-sent until confirmed", async () => {
    const s = await staff();
    await cred("kick01");
    await disconnectLogin("kick01", s.id);
    await blockDevice("aa-bb-cc-dd-ee-04", "sharing", s.id);
    const first = cmdLines((await routerPull([])).body);
    expect(first.map((l) => l.split(",").slice(2).join(","))).toEqual(["k,kick01", "b,AA:BB:CC:DD:EE:04"]);
    expect(cmdLines((await routerPull([])).body)).toHaveLength(2); // not confirmed yet: sent again
    const ids = first.map((l) => l.split(",")[1]!);
    const after = await routerPull([], new Date(), ids);
    expect(after.confirmed).toBe(2);
    expect(cmdLines(after.body)).toHaveLength(0);
    expect(await db.deviceBlock.count()).toBe(1);
    await unblockDevice("AA:BB:CC:DD:EE:04", s.id);
    expect(await db.deviceBlock.count()).toBe(0);
    expect(cmdLines((await routerPull([])).body)[0]).toMatch(/,u,AA:BB:CC:DD:EE:04$/);
    await expect(disconnectLogin("bad user;", s.id)).rejects.toThrow(/Invalid username/);
    await expect(blockDevice("not-a-mac", null, s.id)).rejects.toThrow(/Invalid device/);
  });

  it("pause freezes the clock (no expiry, no access) and resume adds the paused time back", async () => {
    const s = await staff();
    const c = await cred("pau001", { validUntil: new Date(Date.now() + 10 * 60_000) });
    await pauseLogin(c.id, s.id);
    let row = await db.accessCredential.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.pausedAt).not.toBeNull();
    expect(cmdLines((await routerPull([])).body)[0]).toMatch(/,p,pau001$/);
    // Pretend 30 minutes passed while paused: past validUntil, but it must not expire.
    const pausedAt = new Date(Date.now() - 30 * 60_000);
    await db.accessCredential.update({ where: { id: c.id }, data: { pausedAt, validUntil: new Date(Date.now() - 20 * 60_000) } });
    expect(await expireDue()).toBe(0);
    expect((await routerPull([])).body).not.toContain("d,pau001");
    await resumeLogin(c.id, s.id);
    row = await db.accessCredential.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.pausedAt).toBeNull();
    expect(row.status).toBe("ACTIVE");
    const leftMin = (row.validUntil.getTime() - Date.now()) / 60_000;
    expect(leftMin).toBeGreaterThan(9);
    expect(leftMin).toBeLessThan(11); // the 10 minutes left at pause time are back
    const body = (await routerPull([])).body;
    expect(body).toMatch(/^a,pau001,/m); // re-provisioned
    expect(body).toMatch(/,r,pau001$/m);
  });

  it("speed tier and data limit go to the router, then active devices reconnect to apply them", async () => {
    const s = await staff();
    const c = await cred("spd001");
    await setLoginLimits(c.id, { speed: "fast", dataLimitMb: 500 }, s.id);
    const body = (await routerPull([])).body;
    expect(body).toMatch(new RegExp(`^a,spd001,123456,jl-fast,\\d*,${500 * 1024 * 1024}$`, "m"));
    expect(body.split("\n").indexOf(body.split("\n").find((l) => l.startsWith("a,"))!)).toBeLessThan(body.split("\n").findIndex((l) => l.startsWith("c,")));
    expect(cmdLines(body)[0]).toMatch(/,q,spd001$/);
    await setLoginLimits(c.id, { speed: null, dataLimitMb: null }, s.id);
    expect((await routerPull([])).body).toMatch(/^a,spd001,123456,1hour,\d*,0$/m);
  });
});
