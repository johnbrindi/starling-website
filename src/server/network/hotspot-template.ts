// Minimal renderer for MikroTik HotSpot HTML templates, for previewing them without a router.
// Supports $(var), $(if var)…$(elif var)…$(else)…$(endif) as the router does.

export function renderHotspotTemplate(html: string, vars: Record<string, string>): string {
  // Conditionals (non-nested, which is how the Starling templates use them).
  const cond = /\$\(if ([\w-]+)\)([\s\S]*?)\$\(endif\)/g;
  let out = html.replace(cond, (_m, name: string, body: string) => {
    const branches: { test: string | null; text: string }[] = [];
    const parts = body.split(/\$\((elif [\w-]+|else)\)/);
    branches.push({ test: name, text: parts[0] ?? "" });
    for (let i = 1; i < parts.length; i += 2) {
      const tag = parts[i]!;
      branches.push({ test: tag === "else" ? null : tag.slice(5), text: parts[i + 1] ?? "" });
    }
    const hit = branches.find((b) => b.test === null || (vars[b.test] ?? "") !== "");
    return hit ? hit.text : "";
  });
  out = out.replace(/\$\(([\w-]+)\)/g, (_m, name: string) => escapeHtml(vars[name] ?? ""));
  return out;
}

function escapeHtml(v: string) {
  return v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Sample values resembling a real hAP lite session. */
export function sampleHotspotVars(opts: { error?: string; username?: string } = {}): Record<string, string> {
  return {
    "link-login-only": "http://10.5.50.1/login",
    "link-login": "http://10.5.50.1/login?dst=http%3A%2F%2Fneverssl.com%2F",
    "link-logout": "http://10.5.50.1/logout",
    "link-status": "http://10.5.50.1/status",
    "link-orig": "http://neverssl.com/",
    "link-redirect": "http://neverssl.com/",
    mac: "AA:BB:CC:DD:EE:FF",
    ip: "10.5.50.23",
    username: opts.username ?? "awa482",
    error: opts.error ?? "",
    "session-time-left": "1h12m40s",
    uptime: "47m20s",
    "bytes-in-nice": "38.2 MiB",
    "bytes-out-nice": "412.7 MiB",
    "remain-bytes-total": "",
    "remain-bytes-total-nice": "",
  };
}
