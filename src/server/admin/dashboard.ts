import "server-only";
import { db } from "../db";
import { env } from "../env";
import { getNetworkAdapter } from "../network";
import { getActiveProvider } from "../payments/registry";

export async function getDashboard() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const soon = new Date(now.getTime() + 60 * 60_000);
  const realOnly = { isSimulated: false };

  const [customers, activeCreds, onlineSessions, revenueDay, revenueWeek, revenueAll, simulatedRevenue, failedDay, expiringSoon, deadJobs, provisionFailed, networkStatus, recentEvents] =
    await Promise.all([
      db.customer.count(),
      db.accessCredential.count({ where: { status: "ACTIVE", validFrom: { lte: now }, validUntil: { gt: now } } }),
      db.networkSession.count({ where: { endedAt: null } }),
      db.payment.aggregate({ where: { status: "SUCCEEDED", verifiedAt: { gte: dayAgo }, ...realOnly }, _sum: { amountXaf: true }, _count: true }),
      db.payment.aggregate({ where: { status: "SUCCEEDED", verifiedAt: { gte: weekAgo }, ...realOnly }, _sum: { amountXaf: true }, _count: true }),
      db.payment.aggregate({ where: { status: "SUCCEEDED", ...realOnly }, _sum: { amountXaf: true }, _count: true }),
      db.payment.aggregate({ where: { status: "SUCCEEDED", isSimulated: true }, _sum: { amountXaf: true }, _count: true }),
      db.payment.count({ where: { status: { in: ["FAILED", "CANCELLED", "EXPIRED"] }, createdAt: { gte: dayAgo } } }),
      db.accessCredential.findMany({
        where: { status: "ACTIVE", validUntil: { gt: now, lte: soon } },
        orderBy: { validUntil: "asc" },
        take: 10,
        include: { customer: { select: { phone: true } } },
      }),
      db.job.count({ where: { status: "DEAD" } }),
      db.accessCredential.count({ where: { provisionState: "FAILED" } }),
      db.integrationStatus.findUnique({ where: { key: "network" } }),
      db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ]);

  const adapter = getNetworkAdapter();
  let paymentMode = env().PAYMENT_PROVIDER as string;
  let paymentSimulated = true;
  try {
    const p = getActiveProvider();
    paymentMode = p.id;
    paymentSimulated = p.simulated;
  } catch {
    // provider misconfigured; shown as such
  }

  return {
    customers,
    activeSubscriptions: activeCreds,
    onlineSessions,
    revenue: {
      day: { amount: revenueDay._sum.amountXaf ?? 0, count: revenueDay._count },
      week: { amount: revenueWeek._sum.amountXaf ?? 0, count: revenueWeek._count },
      all: { amount: revenueAll._sum.amountXaf ?? 0, count: revenueAll._count },
      simulated: { amount: simulatedRevenue._sum.amountXaf ?? 0, count: simulatedRevenue._count },
    },
    failedPaymentsDay: failedDay,
    expiringSoon,
    deadJobs,
    provisionFailed,
    network: { mode: adapter.kind, simulated: adapter.simulated, status: networkStatus },
    payments: { mode: paymentMode, simulated: paymentSimulated },
    recentEvents,
  };
}
