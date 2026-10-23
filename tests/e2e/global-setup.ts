import { execSync } from "node:child_process";
import { Client } from "pg";
import { E2E_DATABASE_URL, E2E_ENV } from "./env";

/**
 * Prepares the dedicated local e2e database: applies migrations (non-destructive), empties the
 * data tables, then seeds. Guarded so it can only ever run against a local database.
 */
export default async function globalSetup() {
  const url = E2E_DATABASE_URL;
  if (!/@(127\.0\.0\.1|localhost):/.test(url) || !/starling_e2e/.test(url)) throw new Error("Refusing to prepare a non-local or non-e2e database");
  const env = { ...process.env, ...E2E_ENV };
  execSync("npx prisma migrate deploy", { stdio: "pipe", env });
  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  );
  await client.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(", ")} CASCADE`);
  await client.end();
  execSync("npm run db:seed", { stdio: "pipe", env });
}
