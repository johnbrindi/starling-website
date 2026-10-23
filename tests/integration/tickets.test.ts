import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { generateTickets, revokeUnusedTickets, unusedTickets } from "@/server/tickets";
import { runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/tick";
import { syncSessions } from "@/server/network/sync";
import { expireDue, isEntitled } from "@/server/subscriptions/service";
import { makePackage, resetDb, resetOverrides, useFakeNetwork } from "../helpers/fixtures";

describe("printed tickets (time starts at first login)", () => {
  let net: ReturnType<typeof useFakeNetwork>;
  let staffId: string;
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    net = useFakeNetwork();
    staffId = (await db.staffUser.create({ data: { email: "t@x.cm", name: "T", passwordHash: "x", role: "ADMIN" } })).id;
  });

  it("generates unique username/password tickets and pushes them to the router", async () => {
    const pkg = await makePackage({ priceXaf: 1350, durationMinutes: 7 * 24 * 60 });
    const { tickets } = await generateTickets({ packageId: pkg.id, count: 30, batch: "WEEK-01", style: "userpass", activationDays: 30 }, staffId);
    expect(tickets).toHaveLength(30);
    expect(new Set(tickets.map((t) => t.username)).size).toBe(30);
    for (const t of tickets) {
      expect(t.username).toMatch(/^[a-z2-9]{6}$/);
      expect(t.password).toMatch(/^\d{6}$/);
    }
    await runDueJobs(JOB_HANDLERS, { limit: 50 });
    expect(Object.keys(net.store.state.users)).toHaveLength(30);
    await expect(generateTickets({ packageId: pkg.id, count: 1, batch: "WEEK-01", style: "userpass", activationDays: 30 }, staffId)).rejects.toThrow(/already exists/);
  });

  it("the clock starts at the first login seen on the router", async () => {
    const pkg = await makePackage({ durationMinutes: 60 });
    const { tickets } = await generateTickets({ packageId: pkg.id, count: 1, batch: "B1", style: "userpass", activationDays: 30 }, staffId);
    const t = tickets[0]!;
    await runDueJobs(JOB_HANDLERS);
    let cred = await db.accessCredential.findUniqueOrThrow({ where: { username: t.username } });
    expect(cred.firstLoginAt).toBeNull();
    expect(cred.validUntil.getTime() - Date.now()).toBeGreaterThan(29 * 86400_000); // activation window, not the 1 h pass

    expect((await net.adapter.simulateLogin(t.username, t.password, "AA:00:00:00:00:10", "10.5.50.50")).ok).toBe(true);
    await syncSessions();
    cred = await db.accessCredential.findUniqueOrThrow({ where: { username: t.username } });
    expect(cred.firstLoginAt).not.toBeNull();
    expect(cred.validUntil.getTime() - cred.firstLoginAt!.getTime()).toBe(60 * 60_000);
    expect(isEntitled(cred)).toBe(true);
    // Re-pushed with the new end time.
    expect(cred.provisionState).toBe("PENDING");
    await runDueJobs(JOB_HANDLERS);
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: cred.id } })).provisionState).toBe("PROVISIONED");
    // A second sync does not move the start again.
    await syncSessions();
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: cred.id } })).firstLoginAt).toEqual(cred.firstLoginAt);
  });

  it("an unused ticket expires at its activation deadline and is removed from the router", async () => {
    const pkg = await makePackage();
    const { tickets } = await generateTickets({ packageId: pkg.id, count: 1, batch: "B2", style: "code", activationDays: 1 }, staffId);
    await runDueJobs(JOB_HANDLERS);
    await db.accessCredential.update({ where: { username: tickets[0]!.username }, data: { validUntil: new Date(Date.now() - 1000) } });
    expect(await expireDue()).toBe(1);
    await runDueJobs(JOB_HANDLERS);
    expect(net.store.state.users[tickets[0]!.username]).toBeUndefined();
  });

  it("reprint shows only unused tickets; revoke disables only unused ones", async () => {
    const pkg = await makePackage();
    const { tickets } = await generateTickets({ packageId: pkg.id, count: 3, batch: "B3", style: "userpass", activationDays: 30 }, staffId);
    await runDueJobs(JOB_HANDLERS);
    await net.adapter.simulateLogin(tickets[0]!.username, tickets[0]!.password, "AA:00:00:00:00:20", "10.5.50.60");
    await syncSessions();
    const again = await unusedTickets("B3", staffId);
    expect(again.map((t) => t.username).sort()).toEqual([tickets[1]!.username, tickets[2]!.username].sort());
    expect(again[0]!.password).toMatch(/^\d{6}$/);
    expect(await revokeUnusedTickets("B3", staffId)).toBe(2);
    await runDueJobs(JOB_HANDLERS);
    expect(Object.keys(net.store.state.users)).toEqual([tickets[0]!.username]);
  });
});
