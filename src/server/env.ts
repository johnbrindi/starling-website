import "server-only";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined));

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    APP_NAME: z.string().default("Juthelink"),
    DATABASE_URL: z.string().min(1),

    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
    ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, "base64").length === 32, "ENCRYPTION_KEY must be 32 bytes, base64-encoded"),
    CRON_SECRET: z.string().min(24),
    TRUST_PROXY: bool,

    PAYMENT_PROVIDER: z.enum(["simulator", "notchpay", "fapshi", "campay", "manual"]).default("simulator"),
    /** PAYMENT_PROVIDER=manual: the MTN MoMo number customers send money to (staff confirm each payment). */
    MANUAL_MOMO_NUMBER: z.string().regex(/^6\d{8}$/, "MANUAL_MOMO_NUMBER must be 9 digits, e.g. 677358806").default("677358806"),
    CAMPAY_BASE_URL: z.url().default("https://demo.campay.net"),
    CAMPAY_TOKEN: optionalString,
    CAMPAY_USERNAME: optionalString,
    CAMPAY_PASSWORD: optionalString,
    CAMPAY_WEBHOOK_KEY: optionalString,
    FAPSHI_BASE_URL: z.url().default("https://sandbox.fapshi.com"),
    FAPSHI_API_USER: optionalString,
    FAPSHI_API_KEY: optionalString,
    FAPSHI_WEBHOOK_SECRET: optionalString,
    ALLOW_SIMULATED_PAYMENTS: bool,
    NOTCHPAY_BASE_URL: z.url().default("https://api.notchpay.co"),
    NOTCHPAY_PUBLIC_KEY: optionalString,
    NOTCHPAY_PRIVATE_KEY: optionalString,
    NOTCHPAY_WEBHOOK_HASH: optionalString,

    NETWORK_ADAPTER: z.enum(["fake", "routeros", "radius", "routerpull"]).default("fake"),
    /** Shared secret the router sends when it polls /api/router/pull (NETWORK_ADAPTER=routerpull). */
    ROUTER_PULL_KEY: optionalString,
    ALLOW_FAKE_NETWORK: bool,
    ROUTER_HOST: optionalString,
    ROUTER_PORT: z.coerce.number().int().positive().default(8728),
    ROUTER_TLS: bool,
    ROUTER_TLS_INSECURE: bool,
    ROUTER_USERNAME: optionalString,
    ROUTER_PASSWORD: optionalString,
    ROUTER_HOTSPOT_SERVER: z.string().default("hotspot1"),
    ROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    HOTSPOT_LOGIN_URL: z.url().default("http://10.5.50.1/login"),

    RADIUS_NAS_HOST: optionalString,
    RADIUS_COA_PORT: z.coerce.number().int().positive().default(3799),
    RADIUS_SECRET: optionalString,

    VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  })
  .superRefine((env, ctx) => {
    // Production must never silently fall back to simulated money or simulated network access.
    if (env.NODE_ENV === "production") {
      if (env.PAYMENT_PROVIDER === "simulator" || env.ALLOW_SIMULATED_PAYMENTS) {
        ctx.addIssue({
          code: "custom",
          path: ["PAYMENT_PROVIDER"],
          message: "The payment simulator is forbidden in production. Configure a real provider.",
        });
      }
      if (env.NETWORK_ADAPTER === "fake" || env.ALLOW_FAKE_NETWORK) {
        ctx.addIssue({
          code: "custom",
          path: ["NETWORK_ADAPTER"],
          message: "The fake network adapter is forbidden in production. Configure routerpull, routeros or radius.",
        });
      }
      if (!env.APP_URL.startsWith("https://")) {
        ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "APP_URL must use https in production." });
      }
    } else {
      if (env.PAYMENT_PROVIDER === "simulator" && !env.ALLOW_SIMULATED_PAYMENTS) {
        ctx.addIssue({
          code: "custom",
          path: ["ALLOW_SIMULATED_PAYMENTS"],
          message: "Set ALLOW_SIMULATED_PAYMENTS=true to use the simulator outside production.",
        });
      }
      if (env.NETWORK_ADAPTER === "fake" && !env.ALLOW_FAKE_NETWORK) {
        ctx.addIssue({
          code: "custom",
          path: ["ALLOW_FAKE_NETWORK"],
          message: "Set ALLOW_FAKE_NETWORK=true to use the fake network adapter outside production.",
        });
      }
    }
    if (env.PAYMENT_PROVIDER === "notchpay" && (!env.NOTCHPAY_PUBLIC_KEY || !env.NOTCHPAY_WEBHOOK_HASH)) {
      ctx.addIssue({
        code: "custom",
        path: ["NOTCHPAY_PUBLIC_KEY"],
        message: "NOTCHPAY_PUBLIC_KEY and NOTCHPAY_WEBHOOK_HASH are required when PAYMENT_PROVIDER=notchpay.",
      });
    }
    if (env.PAYMENT_PROVIDER === "campay" && !env.CAMPAY_TOKEN && (!env.CAMPAY_USERNAME || !env.CAMPAY_PASSWORD)) {
      ctx.addIssue({ code: "custom", path: ["CAMPAY_TOKEN"], message: "CAMPAY_TOKEN (or CAMPAY_USERNAME and CAMPAY_PASSWORD) is required when PAYMENT_PROVIDER=campay." });
    }
    if (env.PAYMENT_PROVIDER === "fapshi" && (!env.FAPSHI_API_USER || !env.FAPSHI_API_KEY)) {
      ctx.addIssue({ code: "custom", path: ["FAPSHI_API_USER"], message: "FAPSHI_API_USER and FAPSHI_API_KEY are required when PAYMENT_PROVIDER=fapshi." });
    }
    if (env.NETWORK_ADAPTER === "routerpull" && (!env.ROUTER_PULL_KEY || env.ROUTER_PULL_KEY.length < 24)) {
      ctx.addIssue({ code: "custom", path: ["ROUTER_PULL_KEY"], message: "ROUTER_PULL_KEY (at least 24 random characters) is required when NETWORK_ADAPTER=routerpull." });
    }
    if (env.NETWORK_ADAPTER === "routeros" && (!env.ROUTER_HOST || !env.ROUTER_USERNAME || !env.ROUTER_PASSWORD)) {
      ctx.addIssue({
        code: "custom",
        path: ["ROUTER_HOST"],
        message: "ROUTER_HOST, ROUTER_USERNAME and ROUTER_PASSWORD are required when NETWORK_ADAPTER=routeros.",
      });
    }
    if (env.NETWORK_ADAPTER === "radius" && (!env.RADIUS_NAS_HOST || !env.RADIUS_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: ["RADIUS_NAS_HOST"],
        message: "RADIUS_NAS_HOST and RADIUS_SECRET are required when NETWORK_ADAPTER=radius.",
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated server environment. Throws a readable (secret-free) error on misconfiguration. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget the cached env so tests can change process.env. */
export function resetEnvCache() {
  cached = undefined;
}

export function isProduction() {
  return env().NODE_ENV === "production";
}
