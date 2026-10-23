/**
 * Read-only router diagnostics from the server: connection, RouterOS version, hotspot server,
 * profiles, walled garden, NTP and API service restrictions. Changes nothing on the router.
 *   npm run router:check
 */
import "dotenv/config";
import { getNetworkAdapter } from "@/server/network";
import { validateNetwork } from "@/server/network/sync";
import { db } from "@/server/db";

async function main() {
  const adapter = getNetworkAdapter();
  console.log(`Adapter: ${adapter.kind}${adapter.simulated ? " (SIMULATED)" : ""}`);
  const h = await adapter.health();
  console.log(h.ok ? `Connected in ${h.latencyMs} ms: RouterOS ${h.version} on ${h.board}, uptime ${h.uptime}` : `NOT reachable: ${h.error}`);
  if (!h.ok) process.exit(2);
  const checks = await validateNetwork();
  for (const c of checks) console.log(`${c.ok ? "  OK  " : c.severity === "error" ? " FAIL " : " WARN "} ${c.name}: ${c.detail}`);
  const sessions = await adapter.listActiveSessions();
  console.log(`Active hotspot sessions: ${sessions.length}`);
  if (checks.some((c) => !c.ok && c.severity === "error")) process.exit(3);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
