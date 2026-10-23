import "dotenv/config";
import { defineConfig } from "prisma/config";

/** The migration engine speaks libpq: drop the node-pg-only "uselibpqcompat" flag from the URL. */
function migrationUrl(raw: string | undefined) {
  // Textual edit on purpose: re-serialising with URL() can change how the password is encoded.
  return (raw ?? "").replace(/([?&])uselibpqcompat=[^&]*&?/, "$1").replace(/[?&]$/, "");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed.ts",
  },
  datasource: {
    // Not using env() so that `prisma generate` works without a database URL (e.g. in CI builds).
    url: migrationUrl(process.env.DATABASE_URL),
  },
});
