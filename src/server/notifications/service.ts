import "server-only";
import type { Job, NotificationType } from "@/generated/prisma/client";
import { db } from "../db";
import { env } from "../env";
import { enqueue } from "../jobs/queue";
import { log } from "../logger";
import { getSettings } from "../settings";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  /** Stable key; the same key never produces a second notification. */
  dedupeKey: string;
}

export function webPushConfigured() {
  const e = env();
  return Boolean(e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY);
}

/**
 * Records an in-app notice (always) and queues a Web Push message when the customer has
 * subscribed a device. Duplicate keys are ignored, so callers can retry freely.
 */
export async function notify(customerId: string | null, n: NotifyInput) {
  if (!customerId) return; // printed tickets have no online account to notify
  try {
    await db.notification.createMany({
      data: [{ customerId, type: n.type, channel: "IN_APP", title: n.title, body: n.body, dedupeKey: `${n.dedupeKey}:app`, status: "SENT", sentAt: new Date() }],
      skipDuplicates: true,
    });
    if (!webPushConfigured()) return;
    const devices = await db.pushSubscription.count({ where: { customerId } });
    if (devices === 0) return;
    const created = await db.notification.createManyAndReturn({
      data: [{ customerId, type: n.type, channel: "WEB_PUSH", title: n.title, body: n.body, dedupeKey: `${n.dedupeKey}:push` }],
      skipDuplicates: true,
    });
    if (created[0]) await enqueue("SEND_NOTIFICATION", { notificationId: created[0].id }, { maxAttempts: 3 });
  } catch (err) {
    // Notifications must never break payment or expiry processing.
    log.warn("Failed to record notification", { customerId, type: n.type, error: (err as Error).message });
  }
}

/** Job: deliver one Web Push notification to every subscribed device of the customer. */
export async function sendNotificationJob(job: Job) {
  const { notificationId } = job.payload as { notificationId: string };
  const n = await db.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.status === "SENT") return;
  if (!webPushConfigured()) {
    await db.notification.update({ where: { id: n.id }, data: { status: "SKIPPED", error: "Web Push not configured" } });
    return;
  }
  const webpush = (await import("web-push")).default;
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  const subs = await db.pushSubscription.findMany({ where: { customerId: n.customerId } });
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: n.title, body: n.body, type: n.type, url: "/account" }),
        { TTL: 600, urgency: n.type === "EXPIRY_WARNING" || n.type === "EXPIRED" ? "high" : "normal" },
      );
      delivered++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      else await db.pushSubscription.update({ where: { id: s.id }, data: { failures: { increment: 1 } } }).catch(() => undefined);
    }
  }
  await db.notification.update({
    where: { id: n.id },
    data: delivered > 0 ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: "No device accepted the push message" },
  });
}

/** Creates expiry warnings at the configured thresholds (e.g. 15, 5 and 1 minutes before expiry). */
export async function warnExpiring(now = new Date()) {
  const settings = await getSettings();
  const thresholds = [...settings.warningMinutes].sort((a, b) => a - b);
  if (thresholds.length === 0) return 0;
  const horizon = new Date(now.getTime() + thresholds.at(-1)! * 60_000);
  const soon = await db.accessCredential.findMany({
    where: { status: "ACTIVE", validUntil: { gt: now, lte: horizon }, validFrom: { lte: now } },
    select: { id: true, customerId: true, validUntil: true, username: true },
  });
  let sent = 0;
  for (const c of soon) {
    const remainingMin = (c.validUntil.getTime() - now.getTime()) / 60_000;
    const t = thresholds.find((x) => remainingMin <= x);
    if (t === undefined) continue;
    const mins = Math.max(1, Math.ceil(remainingMin));
    await notify(c.customerId, {
      type: "EXPIRY_WARNING",
      title: mins <= 1 ? "Less than a minute left" : `${mins} minutes of Wi-Fi left`,
      body:
        settings.renewalMode === "EXTEND"
          ? "Renew now to stay connected. New time is added after your current time."
          : "Buy a new pass to stay connected after this one ends.",
      dedupeKey: `warn:${c.id}:${c.validUntil.getTime()}:${t}`,
    });
    sent++;
  }
  return sent;
}
