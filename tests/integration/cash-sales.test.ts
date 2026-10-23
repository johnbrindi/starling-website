import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createCashSale } from "@/server/sales";
import { runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/tick";
import { getAccessStatus } from "@/server/subscriptions/status";
import { makePackage, resetDb, resetOverrides, useFakeNetwork } from "../helpers/fixtures";

describe("counter (cash) sales with username + password", () => {
  let net: ReturnType<typeof useFakeNetwork>;
  let staffId: string;
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    net = useFakeNetwork();
    staffId = (await db.staffUser.create({ data: { email: "c@x.cm", name: "Cashier", passwordHash: "x", role: "SUPPORT" } })).id;
  });

  it("creates a unique username + 6-digit password, records the cash, and the router accepts the login", async () => {
    const pkg = await makePackage({ priceXaf: 200, durationMinutes: 1440 });
    const sale = await createCashSale({ packageId: pkg.id, phone: "670555111", name: "Awa Bello", style: "userpass", idempotencyKey: randomUUID() }, staffId);
    expect(sale.style).toBe("userpass");
    expect(sale.username).toMatch(/^awa\d{3}$/);
    expect(sale.password).toMatch(/^\d{6}$/);
    expect(sale.amountXaf).toBe(200);

    const payment = await db.payment.findUniqueOrThrow({ where: { id: sale.paymentId } });
    expect(payment).toMatchObject({ provider: "CASH", status: "SUCCEEDED", isSimulated: false, recordedById: staffId });
    expect(await db.subscription.count({ where: { paymentId: payment.id } })).toBe(1);

    await runDueJobs(JOB_HANDLERS);
    expect((await net.adapter.simulateLogin(sale.username, sale.password, "AA:00:00:00:00:01", "10.5.50.40")).ok).toBe(true);
    expect((await net.adapter.simulateLogin(sale.username, sale.username, "AA:00:00:00:00:02", "10.5.50.41")).ok).toBe(false);

    // The customer sees the same login in their account.
    const status = await getAccessStatus(sale.customerId);
    expect(status.credential).toMatchObject({ username: sale.username, password: sale.password, style: "userpass" });
  });

  it("a double click records one sale", async () => {
    const pkg = await makePackage();
    const key = randomUUID();
    const input = { packageId: pkg.id, phone: "670555222", name: "", style: "userpass" as const, idempotencyKey: key };
    const [a, b] = [await createCashSale(input, staffId), await createCashSale(input, staffId)];
    expect(a.paymentId).toBe(b.paymentId);
    expect(await db.payment.count()).toBe(1);
    expect(await db.subscription.count()).toBe(1);
    expect(a.username).toMatch(/^guest\d{3}$/);
  });

  it("single access code style still works", async () => {
    const pkg = await makePackage();
    const sale = await createCashSale({ packageId: pkg.id, phone: "670555333", name: "", style: "code", idempotencyKey: randomUUID() }, staffId);
    expect(sale.style).toBe("code");
    expect(sale.username).toBe(sale.password);
  });

  it("usernames stay unique across many sales", async () => {
    const pkg = await makePackage();
    const names = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const s = await createCashSale({ packageId: pkg.id, phone: `6705560${String(i).padStart(2, "0")}`, name: "Jo", style: "userpass", idempotencyKey: randomUUID() }, staffId);
      names.add(s.username);
    }
    expect(names.size).toBe(25);
  });
});
