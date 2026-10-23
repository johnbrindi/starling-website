import { db } from "@/server/db";
import { json } from "@/server/http";
import { staffRoute } from "@/server/admin/route";

/** GET /api/admin/audit?action= — audit trail (most recent first). */
export const GET = staffRoute("audit:view", async (req) => {
  const action = req.nextUrl.searchParams.get("action")?.slice(0, 60);
  return json({ events: await db.auditEvent.findMany({ where: action ? { action: { startsWith: action } } : undefined, orderBy: { createdAt: "desc" }, take: 200 }) });
});
