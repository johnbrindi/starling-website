import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { routerPull } from "@/server/network/pull";
import { encrypt } from "@/server/crypto";
import { expireDue } from "@/server/subscriptions/service";
import { makePackage, resetDb, resetOverrides } from "../helpers/fixtures";

let phoneSeq = 10000;
async function cred(username: string, password: string, over: Record<string, unknown> = {}) {
  const c = await db.customer.create({ data: { phone: `+2376700${phoneSeq++}` } });
  return db.accessCredential.create({
    data: { customerId: c.id, username, passwordEnc: encrypt(password), validFrom: new Date(Date.now() - 1000), validUntil: new Date(Date.now() + 3600_000), networkProfileName: "1hour", ...over },
  });
}

describe("router pull protocol", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
  });

  it("sends new logins as plain-text add lines and marks them provisioned once the router confirms", async () => {
    const c = await cred("hbw4x4", "547210");
    const first = await routerPull([]);
    expect(first.body).toMatch(/^a,hbw4x4,547210,1hour,6700\d{5},0$/);
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: c.id } })).provisionState).toBe("PENDING");
    const second = await routerPull(["hbw4x4"]);
    expect(second.confirmed).toBe(1);
    expect(second.body).toBe("");
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: c.id } })).provisionState).toBe("PROVISIONED");
  });

  it("sends deletes for expired logins and marks them removed after confirmation", async () => {
    const c = await cred("old001", "111111", { provisionState: "PROVISIONED", validUntil: new Date(Date.now() - 1000) });
    await expireDue();
    const r = await routerPull([]);
    expect(r.body).toBe("d,old001");
    await routerPull(["old001"]);
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: c.id } })).provisionState).toBe("REMOVED");
  });

  it("never sends values a router script could misread, and keeps the reply small", async () => {
    await cred("bad,user", "123456");
    await cred("good01", "12 34");
    for (let i = 0; i < 60; i++) await cred(`user${String(i).padStart(3, "0")}`, "123456");
    const r = await routerPull([]);
    expect(r.body).not.toContain("bad,user");
    expect(r.body).not.toContain("good01");
    expect(r.body.length).toBeLessThanOrEqual(3500);
    expect(r.adds).toBeLessThanOrEqual(40);
  });

  it("ignores confirmations for unknown or unsafe usernames", async () => {
    const r = await routerPull(["nobody", "x'; drop"]);
    expect(r.confirmed).toBe(0);
  });

  it("derives the router profile from the package length when none is mapped", async () => {
    const pkg = await makePackage({ durationMinutes: 1440 });
    const c = await cred("day001", "222222", { networkProfileName: null });
    await db.subscription.create({ data: { customerId: c.customerId!, packageId: pkg.id, credentialId: c.id, status: "ACTIVE", priceXaf: 200, durationMinutes: 1440, startsAt: new Date(), endsAt: new Date(Date.now() + 86400_000) } });
    expect((await routerPull([])).body).toMatch(/^a,day001,222222,24hours,/);
  });
});
