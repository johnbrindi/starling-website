import { db } from "@/server/db";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { createStaff, createStaffSchema } from "@/server/auth/staff";

const SAFE = { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true, lockedUntil: true } as const;

/** GET /api/admin/staff — staff accounts (super admin only). */
export const GET = staffRoute("staff:manage", async () => json({ staff: await db.staffUser.findMany({ select: SAFE, orderBy: { createdAt: "asc" } }) }));

/** POST /api/admin/staff — create a staff account. */
export const POST = staffRoute("staff:manage", async (req, staff) => {
  const user = await createStaff(await readJson(req, createStaffSchema), staff.staff.id);
  return json({ staff: { id: user.id, email: user.email, role: user.role } }, { status: 201 });
});
