import { readFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/server/env";
import { renderHotspotTemplate, sampleHotspotVars } from "@/server/network/hotspot-template";

const PAGES = new Set(["login", "alogin", "status", "logout"]);

/**
 * DEVELOPMENT ONLY — preview the MikroTik hotspot pages in network/mikrotik/hotspot with sample values:
 *   /api/dev/hotspot-preview?page=login            (also: status, alogin, logout)
 *   /api/dev/hotspot-preview?page=login&error=invalid+username+or+password
 */
export async function GET(req: Request) {
  if (env().NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const page = url.searchParams.get("page") ?? "login";
  if (!PAGES.has(page)) return new Response("Unknown page", { status: 404 });
  const file = path.join(process.cwd(), "network", "mikrotik", "hotspot", `${page}.html`);
  const html = await readFile(file, "utf8");
  const vars = sampleHotspotVars({ error: url.searchParams.get("error") ?? "", username: url.searchParams.get("username") ?? undefined });
  // Point the portal links at this dev server so the buttons work in the preview.
  const local = renderHotspotTemplate(html, vars).replaceAll("https://wifi.example.cm", env().APP_URL).replaceAll('"wifi.example.cm"', `"${new URL(env().APP_URL).host}"`);
  return new Response(local, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
