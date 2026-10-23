import { db } from "@/server/db";
import { AppError } from "@/server/errors";
import { json, readJson } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { profileInputSchema } from "@/server/admin/packages";

/** GET /api/admin/profiles — network profiles (router hotspot user profiles). */
export const GET = staffRoute("network:view", async () => json({ profiles: await db.networkProfile.findMany({ orderBy: { routerName: "asc" } }) }));

/** POST /api/admin/profiles — create a profile mapping. Push it with network action "sync-profiles". */
export const POST = staffRoute("network:manage", async (req, staff) => {
  const input = await readJson(req, profileInputSchema);
  if (await db.networkProfile.findUnique({ where: { routerName: input.routerName } })) throw new AppError("CONFLICT", "Profile already exists.");
  const profile = await db.networkProfile.create({ data: input });
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "profile.created", targetType: "NetworkProfile", targetId: profile.id, ipAddress: staff.ip, metadata: input });
  return json({ profile }, { status: 201 });
});
