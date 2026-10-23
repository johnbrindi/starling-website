import "server-only";
import { db } from "./db";
import { AppError } from "./errors";

/**
 * Fixed-window rate limiter stored in Postgres, so it works across multiple app instances.
 * Throws RATE_LIMITED when the limit is exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count"`;
  const count = rows[0]?.count ?? 0;
  if (count > limit) {
    throw new AppError("RATE_LIMITED", "Too many attempts. Please wait a moment and try again.");
  }
}

export async function purgeExpiredRateLimits() {
  await db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date() } } });
}
