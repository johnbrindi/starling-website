import { db } from "@/server/db";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { createPackage, packageInputSchema } from "@/server/admin/packages";

/** GET /api/admin/packages — all packages including inactive/archived. */
export const GET = staffRoute("dashboard:view", async () =>
  json({ packages: await db.package.findMany({ orderBy: [{ status: "asc" }, { sortOrder: "asc" }], include: { networkProfile: true } }) }),
);

/** POST /api/admin/packages — create a package. */
export const POST = staffRoute("packages:manage", async (req, staff) => {
  const pkg = await createPackage(await readJson(req, packageInputSchema), staff.staff.id, staff.ip);
  return json({ package: pkg }, { status: 201 });
});
