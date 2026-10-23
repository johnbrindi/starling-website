import { json, readJson } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { getSettings, settingsSchema, updateSettings } from "@/server/settings";

/** GET /api/admin/settings */
export const GET = staffRoute("dashboard:view", async () => json({ settings: await getSettings() }));

/** PUT /api/admin/settings — partial update of operational settings. */
export const PUT = staffRoute("settings:manage", async (req, staff) => {
  const patch = await readJson(req, settingsSchema.partial());
  const before = await getSettings();
  const settings = await updateSettings(patch, staff.staff.id);
  await audit({ actorType: "STAFF", actorId: staff.staff.id, action: "settings.updated", ipAddress: staff.ip, metadata: { before, after: settings } });
  return json({ settings });
});
