import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "./errors";
import { env } from "./env";
import { log, errorMessage } from "./logger";

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

export function errorResponse(err: unknown) {
  if (err instanceof AppError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    return json(
      {
        error: {
          code: "VALIDATION_FAILED",
          message: "Some fields are invalid.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 422 },
    );
  }
  // Never leak stack traces or internal messages to clients.
  log.error("Unhandled API error", { error: errorMessage(err), stack: err instanceof Error ? err.stack : undefined });
  return json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/** Wraps a route handler with consistent error handling. */
export function handler<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
  return schema.parse(body);
}

/** Best-effort client IP. Only trusts X-Forwarded-For when TRUST_PROXY=true (behind a known reverse proxy). */
export function clientIp(req: Request): string {
  if (env().TRUST_PROXY) {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "unknown";
}

/**
 * CSRF defence for cookie-authenticated, state-changing requests:
 * the Origin (or Referer) must match APP_URL. Browsers always send Origin on cross-site POSTs.
 */
export function assertSameOrigin(req: Request) {
  const expected = new URL(env().APP_URL).origin;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== expected) throw new AppError("FORBIDDEN", "Cross-site request blocked.");
    return;
  }
  const referer = req.headers.get("referer");
  if (referer && new URL(referer).origin === expected) return;
  throw new AppError("FORBIDDEN", "Missing request origin.");
}
