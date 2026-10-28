import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent: { endpoint: string; payload: Record<string, unknown> }[] = [];
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
      return { statusCode: 201 };
    },
  },
}));

import { db } from "@/server/db";
import { resetEnvCache } from "@/server/env";
import { createCheckout, verifyPayment } from "@/server/payments/service";
import { setPaymentProvider } from "@/server/payments/registry";
import type { PaymentProviderAdapter, StatusResult } from "@/server/payments/types";
import { customerFor, makePackage, resetDb, resetOverrides, useFakeNetwork } from "../helpers/fixtures";

const provider: PaymentProviderAdapter = {
  id: "FAPSHI",
  simulated: false,
  initiate: async () => ({ providerReference: `T-${randomUUID().slice(0, 8)}`, status: "pending", checkoutUrl: "https://checkout.fapshi.com/x" }),
  fetchStatus: async (p): Promise<StatusResult> => ({ status: "succeeded", providerReference: p.providerReference!, amountXaf: 105, currency: "XAF", merchantReference: p.reference, rawStatus: "SUCCESSFUL" }),
  parseWebhook: () => ({ signatureValid: false, eventKey: "x", eventType: null, references: [], payload: {} }),
};

describe("admin push on purchase", () => {
  beforeEach(async () => {
    resetOverrides();
    await resetDb();
    useFakeNetwork();
    process.env.VAPID_PUBLIC_KEY = "test-public";
    process.env.VAPID_PRIVATE_KEY = "test-private";
    resetEnvCache();
    setPaymentProvider(provider);
    sent.length = 0;
  });
  afterAll(() => {
    process.env.VAPID_PUBLIC_KEY = "";
    process.env.VAPID_PRIVATE_KEY = "";
    resetEnvCache();
    resetOverrides();
  });

  it("every admin device gets exactly one 'New purchase' message, even if the payment is checked many times", async () => {
    const admin = await db.staffUser.create({ data: { email: "a@t.local", name: "A", role: "SUPER_ADMIN", passwordHash: "x" } });
    const viewer = await db.staffUser.create({ data: { email: "v@t.local", name: "V", role: "VIEWER", passwordHash: "x" } });
    await db.staffPushSubscription.create({ data: { staffId: admin.id, endpoint: "https://push.test/admin-phone", p256dh: "k".repeat(20), auth: "a".repeat(10) } });
    await db.staffPushSubscription.create({ data: { staffId: viewer.id, endpoint: "https://push.test/viewer-phone", p256dh: "k".repeat(20), auth: "a".repeat(10) } });

    const pkg = await makePackage({ priceXaf: 105, durationMinutes: 60 });
    const customer = await customerFor("670000000");
    const { payment } = await createCheckout(customer.id, { packageId: pkg.id, phone: "670000000", channel: "cm.mtn", idempotencyKey: randomUUID() });
    await Promise.all([verifyPayment(payment.id), verifyPayment(payment.id), verifyPayment(payment.id)]);
    await verifyPayment(payment.id);

    expect(await db.subscription.count()).toBe(1);
    expect(sent).toHaveLength(1); // only approvers, only once
    expect(sent[0]!.endpoint).toBe("https://push.test/admin-phone");
    expect(sent[0]!.payload.title).toMatch(/New purchase: 105.*FCFA/);
    expect(String(sent[0]!.payload.body)).toMatch(/MTN MoMo \(Fapshi\).*Login \w+ created/);
    expect(sent[0]!.payload.url).toBe("/admin/online");
  });
});
