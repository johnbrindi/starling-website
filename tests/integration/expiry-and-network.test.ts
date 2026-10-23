import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createCheckout, verifyPayment } from "@/server/payments/service";
import { expireDue, isEntitled, revokeCredential } from "@/server/subscriptions/service";
import { getAccessStatus } from "@/server/subscriptions/status";
import { reconcileNetwork, syncSessions } from "@/server/network/sync";
import { runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS, tick } from "@/server/jobs/tick";
import { warnExpiring } from "@/server/notifications/service";
import { PHONES, makePackage, resetDb, resetOverrides, setSettings, useFakeNetwork } from "../helpers/fixtures";

async function buy(packageId: string, phone = PHONES.success) {
  const { payment } = await createCheckout({ packageId, phone, channel: "cm.mtn", idempotencyKey: randomUUID() });
  await verifyPayment(payment.id);
  return payment;
}

/** Moves every timestamp of a credential into the past so it is due for expiry. */
async function ageCredential(id: string) {
  await db.accessCredential.update({
    where: { id },
    data: { validFrom: new Date(Date.now() - 2 * 3600_000), validUntil: new Date(Date.now() - 1000) },
  });
}

describe("expiry and network enforcement", () => {
  let net: ReturnType<typeof useFakeNetwork>;
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    net = useFakeNetwork();
  });
  afterAll(() => resetOverrides());

  it("provisions on the router, lets the device log in, then removes and disconnects it at expiry", async () => {
    const pkg = await makePackage({ maxDevices: 1 });
    await buy(pkg.id);
    await runDueJobs(JOB_HANDLERS);
    const cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.provisionState).toBe("PROVISIONED");
    expect((await net.adapter.simulateLogin(cred.username, cred.username, "AA:BB:CC:00:00:01", "10.5.50.10")).ok).toBe(true);
    // Device limit enforced by the router profile.
    expect((await net.adapter.simulateLogin(cred.username, cred.username, "AA:BB:CC:00:00:02", "10.5.50.11")).ok).toBe(false);

    await syncSessions();
    expect((await getAccessStatus(cred.customerId)).state).toBe("ONLINE");

    await ageCredential(cred.id);
    expect(await expireDue()).toBe(1);
    expect(await expireDue()).toBe(0); // idempotent
    await runDueJobs(JOB_HANDLERS);

    const after = await db.accessCredential.findUniqueOrThrow({ where: { id: cred.id } });
    expect(after.status).toBe("EXPIRED");
    expect(after.provisionState).toBe("REMOVED");
    expect(net.store.state.users[cred.username]).toBeUndefined();
    expect(Object.keys(net.store.state.active)).toHaveLength(0);
    expect((await net.adapter.simulateLogin(cred.username, cred.username, "AA:BB:CC:00:00:01", "10.5.50.10")).ok).toBe(false);
    expect((await getAccessStatus(cred.customerId)).state).toBe("EXPIRED");
    expect(await db.subscription.count({ where: { status: "EXPIRED" } })).toBe(1);
  });

  it("an expired credential cannot stay online even if the client still shows a countdown", async () => {
    const pkg = await makePackage();
    await buy(pkg.id);
    await runDueJobs(JOB_HANDLERS);
    const cred = await db.accessCredential.findFirstOrThrow();
    await net.adapter.simulateLogin(cred.username, cred.username, "AA:BB:CC:00:00:01", "10.5.50.10");
    // Database says expired (e.g. clock passed) but expiry job has not run and router still has the session.
    await ageCredential(cred.id);
    expect(isEntitled(await db.accessCredential.findUniqueOrThrow({ where: { id: cred.id } }))).toBe(false);
    const res = await syncSessions();
    expect(res.kicked).toBe(1);
    expect(Object.keys(net.store.state.active)).toHaveLength(0);
  });

  it("EXTEND renewal stacks time on the same code without a second credential", async () => {
    await setSettings({ renewalMode: "EXTEND" });
    const pkg = await makePackage({ durationMinutes: 60 });
    await buy(pkg.id);
    const first = await db.accessCredential.findFirstOrThrow();
    await buy(pkg.id);
    expect(await db.accessCredential.count()).toBe(1);
    const cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.validUntil.getTime()).toBe(first.validUntil.getTime() + 60 * 60_000);
    const subs = await db.subscription.findMany({ orderBy: { startsAt: "asc" } });
    expect(subs.map((s) => s.status)).toEqual(["ACTIVE", "SCHEDULED"]);
    expect(subs[1]!.startsAt.getTime()).toBe(first.validUntil.getTime());
    expect(await db.payment.count({ where: { status: "SUCCEEDED" } })).toBe(2);
  });

  it("IMMEDIATE renewal issues a new code that starts now", async () => {
    await setSettings({ renewalMode: "IMMEDIATE" });
    const pkg = await makePackage({ durationMinutes: 60 });
    await buy(pkg.id);
    await buy(pkg.id);
    const creds = await db.accessCredential.findMany();
    expect(creds).toHaveLength(2);
    expect(creds[0]!.username).not.toBe(creds[1]!.username);
    expect(await db.subscription.count({ where: { status: "ACTIVE" } })).toBe(2);
  });

  it("renewal after expiry creates a fresh credential and does not duplicate earlier transactions", async () => {
    const pkg = await makePackage();
    await buy(pkg.id);
    const old = await db.accessCredential.findFirstOrThrow();
    await ageCredential(old.id);
    await expireDue();
    await buy(pkg.id);
    const creds = await db.accessCredential.findMany({ orderBy: { createdAt: "asc" } });
    expect(creds).toHaveLength(2);
    expect(creds[1]!.status).toBe("ACTIVE");
    expect(await db.payment.count()).toBe(2);
    expect(await db.subscription.count()).toBe(2);
  });

  it("router outage: provisioning retries with backoff and succeeds once the router is back", async () => {
    const pkg = await makePackage();
    await net.adapter.setOnline(false);
    await buy(pkg.id);
    await runDueJobs(JOB_HANDLERS);
    let cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.provisionState).toBe("FAILED");
    const job = await db.job.findFirstOrThrow({ where: { type: "PROVISION_CREDENTIAL" } });
    expect(job.status).toBe("FAILED");
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
    // Payment is still recorded as paid; the customer is told access is being set up.
    expect((await getAccessStatus(cred.customerId)).state).toBe("PROVISIONING");

    await net.adapter.setOnline(true);
    await db.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
    await runDueJobs(JOB_HANDLERS);
    cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.provisionState).toBe("PROVISIONED");
    expect((await getAccessStatus(cred.customerId)).state).toBe("READY");
  });

  it("jobs dead-letter after max attempts", async () => {
    const pkg = await makePackage();
    await net.adapter.setOnline(false);
    await buy(pkg.id);
    const job = await db.job.findFirstOrThrow({ where: { type: "PROVISION_CREDENTIAL" } });
    await db.job.update({ where: { id: job.id }, data: { maxAttempts: 2 } });
    for (let i = 0; i < 2; i++) {
      await db.job.update({ where: { id: job.id }, data: { runAt: new Date() } });
      await runDueJobs(JOB_HANDLERS);
    }
    expect((await db.job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("DEAD");
    // Reconciliation re-queues it once the router is reachable.
    await net.adapter.setOnline(true);
    await reconcileNetwork();
    await runDueJobs(JOB_HANDLERS);
    expect((await db.accessCredential.findFirstOrThrow()).provisionState).toBe("PROVISIONED");
  });

  it("reconciliation removes router users that are not entitled and restores missing ones", async () => {
    const pkg = await makePackage();
    await buy(pkg.id);
    await runDueJobs(JOB_HANDLERS);
    const cred = await db.accessCredential.findFirstOrThrow();
    // Someone deleted the user on the router; and a stray managed user exists.
    delete net.store.state.users[cred.username];
    net.store.state.users["STRAYUSR"] = { password: "x", profile: null, validUntil: new Date(Date.now() + 1e6).toISOString(), limitBytesTotal: null, maxDevices: 1 };
    await reconcileNetwork();
    await runDueJobs(JOB_HANDLERS);
    expect(net.store.state.users[cred.username]).toBeDefined();
    expect(net.store.state.users["STRAYUSR"]).toBeUndefined();
  });

  it("revocation by staff removes access immediately", async () => {
    const pkg = await makePackage();
    await buy(pkg.id);
    await runDueJobs(JOB_HANDLERS);
    const cred = await db.accessCredential.findFirstOrThrow();
    await net.adapter.simulateLogin(cred.username, cred.username, "AA:BB:CC:00:00:01", "10.5.50.10");
    const staff = await db.staffUser.create({ data: { email: "s@x.cm", name: "S", passwordHash: "x", role: "SUPPORT" } });
    await revokeCredential(cred.id, staff.id, "abuse");
    await runDueJobs(JOB_HANDLERS);
    expect(net.store.state.users[cred.username]).toBeUndefined();
    expect(Object.keys(net.store.state.active)).toHaveLength(0);
    expect((await getAccessStatus(cred.customerId)).state).toBe("REVOKED");
    expect(await db.auditEvent.count({ where: { action: "credential.revoked" } })).toBe(1);
  });

  it("sends each expiry warning once per threshold", async () => {
    await setSettings({ warningMinutes: [15, 5] });
    const pkg = await makePackage();
    await buy(pkg.id);
    const cred = await db.accessCredential.findFirstOrThrow();
    await db.accessCredential.update({ where: { id: cred.id }, data: { validUntil: new Date(Date.now() + 12 * 60_000) } });
    await warnExpiring();
    await warnExpiring();
    expect(await db.notification.count({ where: { type: "EXPIRY_WARNING" } })).toBe(1);
    await db.accessCredential.update({ where: { id: cred.id }, data: { validUntil: new Date(Date.now() + 4 * 60_000) } });
    await warnExpiring();
    expect(await db.notification.count({ where: { type: "EXPIRY_WARNING" } })).toBe(2);
  });

  it("the scheduler tick keeps working when the router is down", async () => {
    const pkg = await makePackage();
    await buy(pkg.id);
    const cred = await db.accessCredential.findFirstOrThrow();
    await ageCredential(cred.id);
    await net.adapter.setOnline(false);
    const result = await tick({ force: true });
    expect(result.expire).toBe("ok");
    expect(result.sessions).toMatch(/error/);
    expect((await db.accessCredential.findUniqueOrThrow({ where: { id: cred.id } })).status).toBe("EXPIRED");
  });
});

describe("immediate provisioning fast path", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
  });

  it("provisionNow pushes a fresh credential without waiting for the worker", async () => {
    const { provisionNow } = await import("@/server/jobs/tick");
    const pkg = await makePackage();
    await buy(pkg.id);
    const cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.provisionState).toBe("PENDING");
    await provisionNow(cred.customerId);
    expect((await db.accessCredential.findFirstOrThrow()).provisionState).toBe("PROVISIONED");
  });
});
