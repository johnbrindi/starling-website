// Client-safe formatting helpers. Server stores UTC; these render in the viewer's local timezone.

const xaf = new Intl.NumberFormat("fr-CM", { maximumFractionDigits: 0 });

/** 1500 -> "1 500 FCFA" */
export function formatXaf(amount: number): string {
  return `${xaf.format(amount)} FCFA`;
}

/** Human duration from minutes: 60 -> "1 hour", 1440 -> "24 hours", 10080 -> "1 week". */
export function formatDuration(minutes: number): string {
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (minutes % 43200 === 0) return plural(minutes / 43200, "month");
  if (minutes % 10080 === 0) return plural(minutes / 10080, "week");
  if (minutes >= 1440 && minutes % 1440 === 0 && minutes > 1440) return plural(minutes / 1440, "day");
  if (minutes % 60 === 0) return plural(minutes / 60, "hour");
  if (minutes > 60) return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  return plural(minutes, "minute");
}

/** Countdown text from milliseconds: "2 h 05 min", "4 min 09 s". */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return "Expired";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d} d ${h} h ${pad(m)} min`;
  if (h > 0) return `${h} h ${pad(m)} min`;
  return `${m} min ${pad(s)} s`;
}

/**
 * MikroTik rate-limit "rx/tx" is from the router's point of view: rx = customer upload, tx = download.
 * "2M/4M" -> { upload: "2 Mbps", download: "4 Mbps" }.
 */
export function parseRateLimit(rate: string | null | undefined): { upload: string; download: string } | null {
  const m = rate?.trim().match(/^([\d.]+)([kKmMgG]?)\/([\d.]+)([kKmMgG]?)/);
  if (!m) return null;
  const unit = (u: string) => (u.toLowerCase() === "g" ? "Gbps" : u.toLowerCase() === "m" ? "Mbps" : u.toLowerCase() === "k" ? "kbps" : "bps");
  return { upload: `${m[1]} ${unit(m[2]!)}`, download: `${m[3]} ${unit(m[4]!)}` };
}

export function formatBytes(bytes: number | bigint | null | undefined): string {
  const n = Number(bytes ?? 0);
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDateTime(iso: string | Date): string {
  // Cameroon time everywhere (the server runs in UTC).
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Douala" }).format(new Date(iso));
}

/** "ABCDEFGH" -> "ABCD-EFGH" for readability. */
export function formatAccessCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function maskCode(code: string): string {
  return `••••-••${code.slice(-2)}`;
}
