import "server-only";
import { z } from "zod";
import type { Payment, Prisma } from "@/generated/prisma/client";
import { normalizeCameroonPhone } from "@/lib/phone";
import { db } from "../db";
import { randomCode } from "../crypto";
import { audit } from "../audit";
import { AppError } from "../errors";
import { errorMessage, log } from "../logger";
import { getSettings } from "../settings";
import { fulfilPayment } from "../subscriptions/service";
import { notify } from "../notifications/service";
import { getActiveProvider, getProvider } from "./registry";
import { ProviderError, type MobileMoneyChannel, type StatusResult } from "./types";

export const checkoutSchema = z.object({
  packageId: z.string().min(1).max(40),
  /** Mobile Money number that pays (may differ from the account's number). */
  phone: z.string().min(9).max(20),
  channel: z.enum(["cm.mtn", "cm.orange"]),
  /** Client-generated UUID so double-taps/retries never create two charges. */
  idempotencyKey: z.uuid(),
  clientMac: z
    .string()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/)
    .optional(),
  clientIp: z.union([z.ipv4(), z.ipv6()]).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export function effectivePrice(pkg: { priceXaf: number; promoPriceXaf: number | null; promoEndsAt: Date | null }, now = new Date()) {
  const promo = pkg.promoPriceXaf !== null && pkg.promoPriceXaf < pkg.priceXaf && (!pkg.promoEndsAt || pkg.promoEndsAt > now);
  return { amount: promo ? pkg.promoPriceXaf! : pkg.priceXaf, promoActive: promo };
}

function newReference() {
  // e.g. SW-20261022-K7M4QX2PZT — readable for support, unguessable.
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `SW-${d}-${randomCode(10)}`;
}

/** Starts a Mobile Money payment for a signed-in customer. Never grants access by itself. */
export async function createCheckout(customerId: string, input: CheckoutInput) {
  const phone = normalizeCameroonPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION_FAILED", "Enter a valid Cameroon mobile number (e.g. 6 70 00 00 00).");

  const existing = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) {
    if (existing.customerId !== customerId) throw new AppError("CONFLICT", "Please reload the page and try again.");
    return { payment: existing, instructions: null, reused: true };
  }

  const pkg = await db.package.findUnique({ where: { id: input.packageId } });
  if (!pkg || pkg.status !== "ACTIVE") throw new AppError("NOT_FOUND", "This package is not available.");
  const { amount } = effectivePrice(pkg);
  const settings = await getSettings();
  const provider = getActiveProvider();

  const customer = await db.customer.update({ where: { id: customerId }, data: { lastSeenAt: new Date() } });
  if (customer.isBlocked) throw new AppError("FORBIDDEN", "This number cannot make purchases. Please contact support.");

  const pending = await db.payment.count({
    where: { OR: [{ payerPhone: phone }, { customerId }], status: "PENDING", expiresAt: { gt: new Date() } },
  });
  if (pending >= settings.maxPendingPaymentsPerPhone) {
    throw new AppError("RATE_LIMITED", "You already have payments waiting for approval. Approve or wait for them to expire.");
  }

  let payment: Payment;
  try {
    payment = await db.payment.create({
      data: {
        reference: newReference(),
        idempotencyKey: input.idempotencyKey,
        customerId: customer.id,
        packageId: pkg.id,
        amountXaf: amount,
        provider: provider.id,
        isSimulated: provider.simulated,
        channel: input.channel,
        payerPhone: phone,
        clientMac: input.clientMac?.toUpperCase().replace(/-/g, ":"),
        clientIp: input.clientIp,
        expiresAt: new Date(Date.now() + settings.paymentTimeoutMinutes * 60_000),
      },
    });
  } catch (err) {
    // Concurrent request with the same idempotency key.
    const again = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (again) return { payment: again, instructions: null, reused: true };
    throw err;
  }

  try {
    const res = await provider.initiate({
      reference: payment.reference,
      amountXaf: amount,
      phone,
      channel: input.channel as MobileMoneyChannel,
      description: `${settings.businessName}: ${pkg.name}`,
      customerName: customer.name,
    });
    payment = await db.payment.update({ where: { id: payment.id }, data: { providerReference: res.providerReference, providerStatus: provider.simulated ? null : res.status } });
    await audit({ actorType: "CUSTOMER", actorId: customer.id, action: "payment.initiated", targetType: "Payment", targetId: payment.id, metadata: { amount, provider: provider.id, packageId: pkg.id } });
    return { payment, instructions: res.instructions ?? null, reused: false };
  } catch (err) {
    const message = err instanceof ProviderError ? err.message : "Payment provider error";
    payment = await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: message.slice(0, 300) } });
    log.warn("Payment initiation failed", { paymentId: payment.id, error: errorMessage(err) });
    throw new AppError("PAYMENT_PROVIDER_ERROR", "We could not start the payment. Please try again in a moment.");
  }
}

/**
 * Asks the provider for the authoritative status and applies it. This is the ONLY path that can
 * lead to fulfilment. Browser redirects and webhook bodies are only triggers for this check.
 */
export async function verifyPayment(paymentId: string): Promise<Payment> {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment) throw new AppError("NOT_FOUND", "Payment not found");
  if (payment.status === "SUCCEEDED") {
    await fulfilPayment(payment.id); // idempotent: repairs a crash between verification and fulfilment
    return (await db.payment.findUnique({ where: { id: paymentId } }))!;
  }
  if (payment.status !== "PENDING") return payment;

  const provider = getProvider(payment.provider);
  let result: StatusResult;
  try {
    result = await provider.fetchStatus({ reference: payment.reference, providerReference: payment.providerReference });
  } catch (err) {
    await db.payment.update({ where: { id: payment.id }, data: { lastCheckedAt: new Date(), checkCount: { increment: 1 } } });
    throw err;
  }

  const base: Prisma.PaymentUpdateInput = {
    lastCheckedAt: new Date(),
    checkCount: { increment: 1 },
    ...(provider.simulated ? {} : { providerStatus: result.rawStatus }),
  };

  if (result.status === "succeeded") {
    const amountOk = result.amountXaf === payment.amountXaf;
    const currencyOk = (result.currency ?? "XAF").toUpperCase() === "XAF";
    const refOk = !result.merchantReference || result.merchantReference === payment.reference;
    if (!amountOk || !currencyOk || !refOk) {
      // Never activate on a mismatched confirmation; flag for staff review.
      await db.payment.update({ where: { id: payment.id }, data: { ...base, failureReason: "Provider confirmation did not match (amount/currency/reference). Needs review." } });
      await audit({ actorType: "PROVIDER", action: "payment.mismatch", targetType: "Payment", targetId: payment.id, metadata: { reported: result.amountXaf, currency: result.currency, merchantReference: result.merchantReference } });
      log.error("Payment confirmation mismatch", { paymentId: payment.id });
      return (await db.payment.findUnique({ where: { id: paymentId } }))!;
    }
    await db.payment.update({ where: { id: payment.id }, data: base });
    await fulfilPayment(payment.id);
    await audit({ actorType: "PROVIDER", action: "payment.succeeded", targetType: "Payment", targetId: payment.id, metadata: { provider: payment.provider } });
  } else if (result.status === "failed" || result.status === "cancelled" || result.status === "expired") {
    const status = result.status === "failed" ? "FAILED" : result.status === "cancelled" ? "CANCELLED" : "EXPIRED";
    const moved = await db.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status, failureReason: result.failureReason ?? `Payment ${result.status}`, lastCheckedAt: new Date(), checkCount: { increment: 1 } },
    });
    if (moved.count > 0) {
      await notify(payment.customerId, {
        type: "PAYMENT_FAILED",
        title: "Payment not completed",
        body: "Your Mobile Money payment was not completed. No access was granted. You can try again.",
        dedupeKey: `payfail:${payment.id}`,
      });
    }
  } else if (payment.expiresAt <= new Date()) {
    // Still pending at the provider after our window: stop waiting. A late success is still
    // caught by reconciliation of recently expired payments (see reconcilePayments).
    await db.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "EXPIRED", failureReason: "Not approved in time", lastCheckedAt: new Date(), checkCount: { increment: 1 } },
    });
  } else {
    await db.payment.update({ where: { id: payment.id }, data: base });
  }
  return (await db.payment.findUnique({ where: { id: paymentId } }))!;
}

/** Handles a provider webhook. Signature is checked, event stored once, then status re-verified. */
export async function handleWebhook(providerId: "NOTCHPAY" | "SIMULATOR", rawBody: string, headers: Headers) {
  const provider = getProvider(providerId);
  const parsed = provider.parseWebhook(rawBody, headers);
  let event;
  try {
    event = await db.webhookEvent.create({
      data: {
        provider: providerId,
        eventKey: parsed.eventKey,
        eventType: parsed.eventType,
        signatureValid: parsed.signatureValid,
        payload: (parsed.payload ?? {}) as Prisma.InputJsonValue,
        paymentRef: parsed.references[0],
      },
    });
  } catch {
    // Unique (provider, eventKey): duplicate delivery. Acknowledge without reprocessing.
    return { duplicate: true, accepted: true };
  }
  if (!parsed.signatureValid) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: "Invalid signature" } });
    log.warn("Rejected webhook with invalid signature", { provider: providerId, eventId: event.id });
    return { duplicate: false, accepted: false };
  }
  const payment = parsed.references.length
    ? await db.payment.findFirst({
        where: { provider: providerId, OR: [{ reference: { in: parsed.references } }, { providerReference: { in: parsed.references } }] },
      })
    : null;
  if (!payment) {
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: "No matching payment", processedAt: new Date() } });
    return { duplicate: false, accepted: true };
  }
  try {
    await verifyPayment(payment.id);
    await db.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  } catch (err) {
    // Reconciliation will retry; acknowledge so the provider does not hammer us.
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: errorMessage(err).slice(0, 500) } });
  }
  return { duplicate: false, accepted: true };
}

/**
 * Periodic safety net for missing/delayed webhooks: re-checks pending payments, plus payments that
 * expired locally in the last 24 h (a late provider success must still be honoured).
 */
export async function reconcilePayments(now = new Date()) {
  const pending = await db.payment.findMany({
    where: {
      OR: [
        { status: "PENDING", OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 20_000) } }] },
        { status: "EXPIRED", isSimulated: false, updatedAt: { gt: new Date(now.getTime() - 24 * 3600_000) }, checkCount: { lt: 30 }, lastCheckedAt: { lt: new Date(now.getTime() - 10 * 60_000) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let checked = 0;
  for (const p of pending) {
    try {
      if (p.status === "EXPIRED") {
        const r = await getProvider(p.provider).fetchStatus(p);
        await db.payment.update({ where: { id: p.id }, data: { lastCheckedAt: new Date(), checkCount: { increment: 1 } } });
        if (r.status === "succeeded" && r.amountXaf === p.amountXaf) {
          await db.payment.update({ where: { id: p.id }, data: { status: "PENDING", failureReason: null } });
          await verifyPayment(p.id);
          log.info("Late payment success recovered", { paymentId: p.id });
        }
      } else {
        await verifyPayment(p.id);
      }
      checked++;
    } catch (err) {
      log.warn("Payment reconciliation failed", { paymentId: p.id, error: errorMessage(err) });
    }
  }
  // Paid but never fulfilled (e.g. crash between steps): repair.
  const orphaned = await db.payment.findMany({ where: { status: "SUCCEEDED", subscription: null }, take: 50 });
  for (const p of orphaned) {
    try {
      await fulfilPayment(p.id);
      log.warn("Repaired paid payment without subscription", { paymentId: p.id });
    } catch (err) {
      log.error("Could not repair payment", { paymentId: p.id, error: errorMessage(err) });
    }
  }
  return checked;
}

/** DEVELOPMENT ONLY: set the simulator's remote outcome for a payment. */
export async function simulatorDecide(paymentId: string, decision: "succeeded" | "failed" | "cancelled") {
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p || p.provider !== "SIMULATOR" || !p.isSimulated) throw new AppError("NOT_FOUND", "Simulated payment not found");
  getProvider("SIMULATOR"); // throws if the simulator is disabled
  await db.payment.update({ where: { id: p.id }, data: { providerStatus: decision } });
  return verifyPayment(p.id);
}
