import "server-only";
import { db } from "../db";
import { env } from "../env";
import { log } from "../logger";
import { ROLE_PERMISSIONS } from "../auth/rbac";
import { formatXaf } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { webPushConfigured } from "./service";

export interface StaffPush {
  title: string;
  body: string;
  /** Same tag replaces an older notification for the same thing. */
  tag: string;
  url: string;
}

const APPROVER_ROLES = (Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]).filter((r) => ROLE_PERMISSIONS[r].includes("payments:approve"));

/** Sends a Web Push message to the devices of active staff (all approvers, or one staff member). */
export async function pushToStaff(msg: StaffPush, opts: { staffId?: string } = {}): Promise<{ sent: number; devices: number }> {
  if (!webPushConfigured()) return { sent: 0, devices: 0 };
  const subs = await db.staffPushSubscription.findMany({
    where: { staff: { isActive: true, role: { in: APPROVER_ROLES } }, ...(opts.staffId ? { staffId: opts.staffId } : {}) },
  });
  if (!subs.length) return { sent: 0, devices: 0 };
  const webpush = (await import("web-push")).default;
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  const payload = JSON.stringify({ ...msg, type: msg.tag, sticky: true });
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "high", timeout: 8000 }),
    ),
  );
  let sent = 0;
  await Promise.all(
    results.map(async (r, i) => {
      if (r.status === "fulfilled") {
        sent++;
        return;
      }
      const status = (r.reason as { statusCode?: number }).statusCode;
      // Gone devices are removed; others are retried next time.
      if (status === 404 || status === 410) await db.staffPushSubscription.delete({ where: { id: subs[i]!.id } }).catch(() => undefined);
      else await db.staffPushSubscription.update({ where: { id: subs[i]!.id }, data: { failures: { increment: 1 } } }).catch(() => undefined);
    }),
  );
  if (sent < subs.length) log.warn("Some staff push messages failed", { sent, devices: subs.length });
  return { sent, devices: subs.length };
}

/** "New MoMo payment to confirm" for every approver's phone. Never throws. */
export async function notifyStaffOfClaim(paymentId: string) {
  try {
    const p = await db.payment.findUnique({ where: { id: paymentId }, include: { package: { select: { name: true } }, proof: { select: { id: true } } } });
    if (!p || p.status !== "PENDING") return;
    const proof = [p.providerReference ? `ID ${p.providerReference}` : null, p.proof ? "screenshot" : null].filter(Boolean).join(" + ");
    await pushToStaff({
      title: `New MoMo payment: ${formatXaf(p.amountXaf)}`,
      body: `${p.package.name} from ${formatPhone(p.payerPhone)} (${proof}). Tap to confirm.`,
      tag: `momo-${p.id}`,
      url: "/admin/confirm",
    });
  } catch (err) {
    log.warn("Staff notification failed", { paymentId, error: (err as Error).message });
  }
}
