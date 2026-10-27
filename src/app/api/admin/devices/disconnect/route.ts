import { z } from "zod";
import { json, readJson } from "@/server/http";
import { staffRoute } from "@/server/admin/route";
import { disconnectLogin } from "@/server/network/control";

/** POST /api/admin/devices/disconnect — disconnect every device using a login. Body: { username }. */
export const POST = staffRoute("customers:revoke", async (req, staff) => {
  const { username } = await readJson(req, z.object({ username: z.string().min(1).max(40) }));
  await disconnectLogin(username, staff.staff.id, staff.ip);
  return json({ ok: true, message: "Disconnecting… done within about 10 seconds. They must log in again." });
});
