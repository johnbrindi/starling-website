import "server-only";

type Level = "debug" | "info" | "warn" | "error";

const SECRET_KEYS = /pass(word)?|secret|token|authorization|cookie|key|signature|hash|credential/i;

/** Recursively masks values whose key looks sensitive. Logs must never contain credentials. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
  }
  return out;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  if (process.env.NODE_ENV === "test" && process.env.LOG_LEVEL !== "debug") return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
