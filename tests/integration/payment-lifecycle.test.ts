import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createCheckout, handleWebhook, reconcilePayments, simulatorDecide, verifyPayment } from "@/server/payments/service";
import { fulfilPayment } from "@/server/subscriptions/service";
import { setPaymentProvider } from "@/server/payments/registry";
import { NotchPayProvider } from "@/server/payments/providers/notchpay";
import type { PaymentProviderAdapter, StatusResult } from "@/server/payments/types";
import { runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/tick";
import { PHONES, makePackage, resetDb, resetOverrides, useFakeNetwork } from "../helpers/fixtures";
import { createHmac } from "node:crypto";

const checkout = (packageId: string, phone: string, key = randomUUID()) =>
  createCheckout({ packageId, phone, channel: "cm.mtn", idempotencyKey: key });

describe("payment → subscription lifecycle", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
  });
  afterAll(() => resetOverrides());

  it("creates a pending payment and grants nothing before verification", async () => {
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.success);
    expect(payment.status).toBe("PENDING");
    expect(payment.amountXaf).toBe(100);
    expect(payment.isSimulated).toBe(true);
    expect(await db.subscription.count()).toBe(0);
    expect(await db.accessCredential.count()).toBe(0);
  });

  it("a verified payment creates exactly one subscription, even when verified repeatedly", async () => {
    const pkg = await makePackage({ durationMinutes: 60 });
    const { payment } = await checkout(pkg.id, PHONES.success);
    const before = Date.now();
    await Promise.all([verifyPayment(payment.id), verifyPayment(payment.id), verifyPayment(payment.id)]);
    await verifyPayment(payment.id);

    const p = await db.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(p.status).toBe("SUCCEEDED");
    expect(await db.subscription.count()).toBe(1);
    const cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.username).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(cred.validUntil.getTime() - cred.validFrom.getTime()).toBe(60 * 60_000);
    expect(cred.validFrom.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // Payment success != provisioned: the credential waits for the network adapter.
    expect(cred.provisionState).toBe("PENDING");
  });

  it("refuses to activate a failed payment", async () => {
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.fail);
    const p = await verifyPayment(payment.id);
    expect(p.status).toBe("FAILED");
    await expect(fulfilPayment(payment.id)).rejects.toThrow(/failed/i);
    expect(await db.subscription.count()).toBe(0);
  });

  it("a pending payment stays pending and never grants access; it expires after the window", async () => {
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.pending);
    expect((await verifyPayment(payment.id)).status).toBe("PENDING");
    await db.payment.update({ where: { id: payment.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await verifyPayment(payment.id)).status).toBe("EXPIRED");
    expect(await db.accessCredential.count()).toBe(0);
  });

  it("the same idempotency key never creates a second charge", async () => {
    const pkg = await makePackage();
    const key = randomUUID();
    const a = await checkout(pkg.id, PHONES.pending, key);
    const b = await checkout(pkg.id, PHONES.pending, key);
    expect(b.payment.id).toBe(a.payment.id);
    expect(b.reused).toBe(true);
    expect(await db.payment.count()).toBe(1);
  });

  it("rejects inactive packages", async () => {
    const pkg = await makePackage({ status: "INACTIVE" });
    await expect(checkout(pkg.id, PHONES.success)).rejects.toThrow(/not available/);
  });

  it("does not activate when the provider reports a different amount", async () => {
    const pkg = await makePackage({ priceXaf: 1350 });
    const lying: PaymentProviderAdapter = {
      id: "SIMULATOR",
      simulated: true,
      initiate: async (i) => ({ providerReference: `X-${i.reference}`, status: "pending" }),
      fetchStatus: async (p): Promise<StatusResult> => ({ status: "succeeded", providerReference: "X", amountXaf: 100, currency: "XAF", merchantReference: p.reference, rawStatus: "complete" }),
      parseWebhook: () => ({ signatureValid: true, eventKey: "k", eventType: null, references: [], payload: {} }),
    };
    setPaymentProvider(lying);
    const { payment } = await checkout(pkg.id, PHONES.pending);
    const p = await verifyPayment(payment.id);
    expect(p.status).toBe("PENDING");
    expect(p.failureReason).toMatch(/did not match/);
    expect(await db.subscription.count()).toBe(0);
  });

  it("dev simulator decisions are applied through server-side verification", async () => {
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.pending);
    const p = await simulatorDecide(payment.id, "succeeded");
    expect(p.status).toBe("SUCCEEDED");
    expect(await db.subscription.count()).toBe(1);
  });

  it("reconciliation repairs a paid payment whose fulfilment crashed midway", async () => {
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.pending);
    // Simulate a crash after marking SUCCEEDED but before creating the subscription.
    await db.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", verifiedAt: new Date() } });
    expect(await db.subscription.count()).toBe(0);
    await reconcilePayments();
    expect(await db.subscription.count()).toBe(1);
  });
});

describe("Notch Pay webhooks", () => {
  const hash = "hsk_test_secret";
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
  });

  function notch(statusFor: () => string, amount = 100) {
    const provider = new NotchPayProvider({ baseUrl: "https://api.notchpay.test", publicKey: "pk_test", webhookHash: hash });
    provider.initiate = async () => ({ providerReference: "trx.test123", status: "pending" });
    provider.fetchStatus = async () => ({
      status: statusFor() === "complete" ? "succeeded" : statusFor() === "failed" ? "failed" : "pending",
      providerReference: "trx.test123",
      amountXaf: amount,
      currency: "XAF",
      merchantReference: null,
      rawStatus: statusFor(),
    });
    // Route both ids through this provider in the test.
    setPaymentProvider(provider);
    return provider;
  }

  const sign = (body: string, key = hash) => createHmac("sha256", key).update(body).digest("hex");

  it("ignores a forged webhook (bad signature) and grants nothing", async () => {
    notch(() => "complete");
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.pending);
    const body = JSON.stringify({ id: "evt_1", type: "payment.complete", data: { reference: "trx.test123", status: "complete" } });
    const res = await handleWebhook("NOTCHPAY", body, new Headers({ "x-notch-signature": sign(body, "wrong") }));
    expect(res.accepted).toBe(false);
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PENDING");
    expect(await db.subscription.count()).toBe(0);
  });

  it("a webhook claiming success is re-verified with the provider before activation", async () => {
    let remote = "processing";
    notch(() => remote);
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.pending);
    const body = JSON.stringify({ id: "evt_2", type: "payment.complete", data: { reference: "trx.test123", status: "complete" } });
    // Webhook says complete, but the provider API still says processing -> no access.
    await handleWebhook("NOTCHPAY", body, new Headers({ "x-notch-signature": sign(body) }));
    expect(await db.subscription.count()).toBe(0);
    remote = "complete";
    const body2 = JSON.stringify({ id: "evt_3", type: "payment.complete", data: { reference: "trx.test123" } });
    await handleWebhook("NOTCHPAY", body2, new Headers({ "x-notch-signature": sign(body2) }));
    expect((await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("SUCCEEDED");
    expect(await db.subscription.count()).toBe(1);
  });

  it("duplicate webhook deliveries are processed once", async () => {
    notch(() => "complete");
    const pkg = await makePackage();
    await checkout(pkg.id, PHONES.pending);
    const body = JSON.stringify({ id: "evt_dup", type: "payment.complete", data: { reference: "trx.test123" } });
    const headers = new Headers({ "x-notch-signature": sign(body) });
    const results = await Promise.all([handleWebhook("NOTCHPAY", body, headers), handleWebhook("NOTCHPAY", body, headers)]);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(await db.webhookEvent.count()).toBe(1);
    expect(await db.subscription.count()).toBe(1);
  });

  it("provisioning runs through the job queue after payment", async () => {
    notch(() => "complete");
    const pkg = await makePackage();
    const { payment } = await checkout(pkg.id, PHONES.pending);
    await verifyPayment(payment.id);
    await runDueJobs(JOB_HANDLERS);
    const cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.provisionState).toBe("PROVISIONED");
  });
});

describe("prepaid vouchers", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
  });

  it("a voucher grants its package exactly once", async () => {
    const { generateVouchers, redeemVoucher } = await import("@/server/subscriptions/service");
    const pkg = await makePackage({ durationMinutes: 720, priceXaf: 150 });
    const staff = await db.staffUser.create({ data: { email: "a@x.cm", name: "A", passwordHash: "x", role: "ADMIN" } });
    const { codes } = await generateVouchers({ packageId: pkg.id, count: 3, batch: "CARD-001", expiresAt: null }, staff.id);
    expect(codes).toHaveLength(3);
    expect(await db.voucher.count()).toBe(3);
    // Codes are not stored in plaintext.
    const raw = JSON.stringify(await db.voucher.findMany());
    expect(raw).not.toContain(codes[0]!.replace(/-/g, ""));

    const a = await db.customer.create({ data: { phone: "+237670000010" } });
    const b = await db.customer.create({ data: { phone: "+237670000020" } });
    const [r1, r2] = await Promise.all([redeemVoucher(a.id, codes[0]!), redeemVoucher(a.id, codes[0]!.toLowerCase())]);
    expect(r1.subscriptionId).toBe(r2.subscriptionId);
    expect(await db.subscription.count()).toBe(1);
    await expect(redeemVoucher(b.id, codes[0]!)).rejects.toThrow(/already been used/);
    await expect(redeemVoucher(b.id, "NOPE-NOPE-NOPE")).rejects.toThrow(/not valid/);
    const cred = await db.accessCredential.findFirstOrThrow();
    expect(cred.validUntil.getTime() - cred.validFrom.getTime()).toBe(720 * 60_000);
    expect(await db.payment.count()).toBe(0);
  });
});
