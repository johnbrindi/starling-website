import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { approveManualPayment, claimManualPayment, claimSchema, createCheckout, rejectManualPayment, verifyPayment } from "@/server/payments/service";
import { setPaymentProvider } from "@/server/payments/registry";
import { ManualMomoProvider } from "@/server/payments/providers/manual";
import { toPaymentDto } from "@/server/payments/dto";
import { PHONES, customerFor, makePackage, resetDb, resetOverrides, useFakeNetwork } from "../helpers/fixtures";

async function staff() {
  return db.staffUser.create({ data: { email: `s${randomUUID().slice(0, 8)}@test.local`, name: "Staff", role: "SUPPORT", passwordHash: "x" } });
}

async function start(phone = PHONES.success) {
  const pkg = await makePackage({ priceXaf: 105, durationMinutes: 60 });
  const customer = await customerFor(phone);
  const { payment, instructions } = await createCheckout(customer.id, { packageId: pkg.id, phone, channel: "cm.mtn", idempotencyKey: randomUUID() });
  return { payment, instructions, customer };
}

describe("manual MTN MoMo payments", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
    setPaymentProvider(new ManualMomoProvider({ momoNumber: "677358806" }));
  });
  afterAll(() => resetOverrides());

  it("tells the customer the exact USSD code and grants nothing until staff approve", async () => {
    const { payment, instructions, customer } = await start();
    expect(payment.provider).toBe("MANUAL");
    expect(payment.providerReference).toBeNull();
    expect(instructions).toContain("*126*9*677358806*105#");
    const dto = toPaymentDto((await db.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { package: true } })));
    expect(dto.manual?.ussd).toBe("*126*9*677358806*105#");

    const claimed = await claimManualPayment(customer.id, payment.id, claimSchema.parse({ transactionId: " 98765 43210 " }));
    expect(claimed.providerReference).toBe("9876543210");
    expect(claimed.status).toBe("PENDING");
    await verifyPayment(payment.id); // polling never approves a manual payment
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
    expect(await db.accessCredential.count()).toBe(0);

    const s = await staff();
    await approveManualPayment(payment.id, s.id);
    const p = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.status).toBe("SUCCEEDED");
    expect(p.recordedById).toBe(s.id);
    expect(await db.subscription.count()).toBe(1);
    const cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.provisionState).toBe("PENDING"); // the router collects it on its next poll
    // Approving twice never creates a second pass.
    await expect(approveManualPayment(payment.id, s.id)).rejects.toThrow(/already succeeded/);
    expect(await db.subscription.count()).toBe(1);
  });

  it("one MoMo transaction ID can pay for one purchase only", async () => {
    const a = await start(PHONES.success);
    const b = await start(PHONES.pending);
    await claimManualPayment(a.customer.id, a.payment.id, claimSchema.parse({ transactionId: "ABC123456" }));
    await expect(claimManualPayment(b.customer.id, b.payment.id, claimSchema.parse({ transactionId: "abc123456" }))).rejects.toThrow(/already used/);
  });

  it("customers cannot claim someone else's payment, and bad IDs are refused", async () => {
    const a = await start(PHONES.success);
    const other = await customerFor(PHONES.fail);
    await expect(claimManualPayment(other.id, a.payment.id, claimSchema.parse({ transactionId: "123456789" }))).rejects.toThrow(/not found/i);
    expect(() => claimSchema.parse({ transactionId: "12" })).toThrow();
    expect(() => claimSchema.parse({ transactionId: "<script>" })).toThrow();
  });

  it("accepts a screenshot instead of a Transaction ID, refuses reused screenshots and non-images", async () => {
    const png = (seed: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed, 1, 2, 3]);
    const a = await start(PHONES.success);
    await expect(claimManualPayment(a.customer.id, a.payment.id, {})).rejects.toThrow(/Transaction ID or add a screenshot/);
    await expect(claimManualPayment(a.customer.id, a.payment.id, { screenshot: new TextEncoder().encode("<html>not an image</html>") })).rejects.toThrow(/photo or screenshot/);
    const claimed = await claimManualPayment(a.customer.id, a.payment.id, { screenshot: png(1) });
    expect(claimed.claimedAt).not.toBeNull();
    expect(claimed.providerReference).toBeNull();
    const proof = await db.paymentProof.findUniqueOrThrow({ where: { paymentId: a.payment.id } });
    expect(proof.mimeType).toBe("image/png");
    expect(toPaymentDto({ ...claimed }).manual?.hasScreenshot).toBe(true);

    const b = await start(PHONES.pending);
    await expect(claimManualPayment(b.customer.id, b.payment.id, { screenshot: png(1) })).rejects.toThrow(/screenshot was already used/);
    // Adding the Transaction ID later to the same payment is fine.
    const both = await claimManualPayment(a.customer.id, a.payment.id, { transactionId: "TX998877" });
    expect(both.providerReference).toBe("TX998877");
  });

  it("rejected payments grant nothing; unclaimed ones expire; late approval still works", async () => {
    const s = await staff();
    const a = await start(PHONES.success);
    await rejectManualPayment(a.payment.id, s.id, "no money received");
    expect((await db.payment.findUniqueOrThrow({ where: { id: a.payment.id } })).status).toBe("FAILED");
    await expect(approveManualPayment(a.payment.id, s.id)).rejects.toThrow(/already failed/);

    const b = await start(PHONES.pending);
    await db.payment.update({ where: { id: b.payment.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await verifyPayment(b.payment.id);
    expect((await db.payment.findUniqueOrThrow({ where: { id: b.payment.id } })).status).toBe("EXPIRED");
    await approveManualPayment(b.payment.id, s.id); // money arrived after all
    expect((await db.payment.findUniqueOrThrow({ where: { id: b.payment.id } })).status).toBe("SUCCEEDED");
    expect(await db.subscription.count()).toBe(1);
  });
});
