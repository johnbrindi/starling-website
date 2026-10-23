import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { json, readJson } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { profileInputSchema } from "@/server/admin/packages";

/** PUT /api/admin/profiles/:id */
export const PUT = staffRoute("network:manage", async (req, staff, ctx: RouteContext<"/api/admin/profiles/[id]">) => {
  const { id } = await ctx.params;
  const input = await readJson(req, profileInputSchema);
  const clash = await db.networkProfile.findUnique({ where: { routerName: input.routerName } });
  if (clash && clash.id !== id) throw new AppError("CONFLICT", "Another profile uses this name.");
  const profile = await db.networkProfile.update({ where: { id }, data: input });
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "profile.updated", targetType: "NetworkProfile", targetId: id, ipAddress: staff.ip, metadata: input });
  return json({ profile });
});

/** DELETE /api/admin/profiles/:id — only when no package uses it. */
export const DELETE = staffRoute("network:manage", async (_req, staff, ctx: RouteContext<"/api/admin/profiles/[id]">) => {
  const { id } = await ctx.params;
  if (await db.package.count({ where: { networkProfileId: id } })) throw new AppError("CONFLICT", "Packages still use this profile.");
  await db.networkProfile.delete({ where: { id } });
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "profile.deleted", targetType: "NetworkProfile", targetId: id, ipAddress: staff.ip });
  return json({ ok: true });
});
