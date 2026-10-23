import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { packageInputSchema, updatePackage } from "@/server/admin/packages";

/** PUT /api/admin/packages/:id — update price, duration, limits, status (applies to new purchases). */
export const PUT = staffRoute("packages:manage", async (req, staff, ctx: RouteContext<"/api/admin/packages/[id]">) => {
  const { id } = await ctx.params;
  const pkg = await updatePackage(id, await readJson(req, packageInputSchema), staff.staff.id, staff.ip);
  return json({ package: pkg });
});
