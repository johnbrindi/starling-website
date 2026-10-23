import "server-only";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * TLS for managed Postgres. With DATABASE_CA_CERT (PEM text or a file path, e.g. Supabase's
 * "prod-ca-2021.crt") the server certificate is fully verified. Without it, the connection string's
 * sslmode applies (use "sslmode=require&uselibpqcompat=true" for encrypted-but-unverified).
 */
function sslOptions() {
  const ca = process.env.DATABASE_CA_CERT?.trim();
  if (!ca) return undefined;
  const pem = ca.startsWith("-----BEGIN") ? ca.replace(/\\n/g, "\n") : readFileSync(ca, "utf8");
  return { ca: pem, rejectUnauthorized: true };
}

function createClient() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const ssl = sslOptions();
  let connectionString = raw;
  if (ssl) {
    // Explicit TLS options must not be overridden by sslmode parameters in the URL.
    // Textual edit on purpose: re-serialising with URL() can change how the password is encoded.
    connectionString = raw.replace(/([?&])(sslmode|uselibpqcompat|sslrootcert)=[^&]*/g, "$1").replace(/[?&]+$/, "").replace(/\?&+/, "?").replace(/&&+/g, "&");
  }
  const adapter = new PrismaPg({ connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 5), ...(ssl ? { ssl } : {}) });
  return new PrismaClient({ adapter });
}

function getClient(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

/**
 * Shared Prisma client, created on first use (one per process, reused across hot reloads).
 * Lazy so that importing server modules (e.g. during `next build`) never needs a database.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
