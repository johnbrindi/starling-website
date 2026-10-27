import { z } from "zod";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { unblockDevice } from "@/server/network/control";

/** POST /api/admin/devices/unblock — allow a blocked device again. Body: { mac }. */
export const POST = staffRoute("customers:revoke", async (req, staff) => {
  const { mac } = await readJson(req, z.object({ mac: z.string().min(11).max(20) }));
  await unblockDevice(mac, staff.staff.id, staff.ip);
  return json({ ok: true, message: "Device unblocked. It can connect again within about 20 seconds." });
});
