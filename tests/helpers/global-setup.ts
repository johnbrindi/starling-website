import { execSync } from "node:child_process";

/** Applies migrations to the dedicated test database (never the development/production one). */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://starling:starling_dev_only@127.0.0.1:54329/starling_test";
  if (!/127\.0\.0\.1|localhost/.test(url)) throw new Error("Refusing to run tests against a non-local database");
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
}
