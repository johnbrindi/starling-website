import { afterAll } from "vitest";

afterAll(async () => {
  const { db } = await import("@/server/db");
  await db.$disconnect();
});
