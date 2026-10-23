import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { updateStaff, updateStaffSchema } from "@/server/auth/staff";

/** PATCH /api/admin/staff/:id — { role?, isActive?, name? }. Cannot demote yourself or the last super admin. */
export const PATCH = staffRoute("staff:manage", async (req, staff, ctx: RouteContext<"/api/admin/staff/[id]">) => {
  const { id } = await ctx.params;
  const user = await updateStaff(id, await readJson(req, updateStaffSchema), { id: staff.staff.id, role: staff.staff.role }, staff.ip);
  return json({ staff: { id: user.id, role: user.role, isActive: user.isActive } });
});
