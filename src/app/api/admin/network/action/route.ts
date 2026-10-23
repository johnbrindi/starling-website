import { z } from "zod";
import { json, readJson } from "@/server/http";
import { audit } from "@/server/audit";
import { staffRoute } from "@/server/admin/route";
import { checkNetworkHealth, reconcileNetwork, syncProfiles, syncSessions, validateNetwork } from "@/server/network/sync";
import { runDueJobs } from "@/server/jobs/queue";
import { JOB_HANDLERS } from "@/server/jobs/tick";

/**
 * POST /api/admin/network/action — { action }. A fixed allow-list of safe operations;
 * there is deliberately no way to send arbitrary RouterOS commands from the browser.
 */
const ACTIONS = {
  health: { permission: "network:view", run: () => checkNetworkHealth() },
  validate: { permission: "network:view", run: () => validateNetwork() },
  "sync-sessions": { permission: "network:manage", run: () => syncSessions() },
  "sync-profiles": { permission: "network:manage", run: () => syncProfiles() },
  reconcile: {
    permission: "network:manage",
    run: async () => {
      const r = await reconcileNetwork();
      await runDueJobs(JOB_HANDLERS, { limit: 50 });
      return r;
    },
  },
} as const;

export const POST = staffRoute("network:view", async (req, staff) => {
  const { action } = await readJson(req, z.object({ action: z.enum(Object.keys(ACTIONS) as [keyof typeof ACTIONS]) }));
  const def = ACTIONS[action];
  if (def.permission === "network:manage") {
    const { can } = await import("@/server/auth/rbac");
    if (!can(staff.staff.role, "network:manage")) return json({ error: { code: "FORBIDDEN", message: "You do not have permission to do this." } }, { status: 403 });
  }
  const started = Date.now();
  try {
    const result = await def.run();
    await audit({ actorType: "STAFF", actorId: staff.staff.id, action: `network.${action}`, ipAddress: staff.ip, metadata: { ms: Date.now() - started } });
    return json({ ok: true, result: JSON.parse(JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) });
  } catch (err) {
    await audit({ actorType: "STAFF", actorId: staff.staff.id, action: `network.${action}.failed`, ipAddress: staff.ip, metadata: { error: (err as Error).message } });
    return json({ ok: false, error: { code: "NETWORK_ERROR", message: (err as Error).message } }, { status: 502 });
  }
});
