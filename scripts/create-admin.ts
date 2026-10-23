/**
 * Creates (or resets) a SUPER_ADMIN account interactively. The password is read from the terminal
 * and never written to disk or shell history.
 *   npm run admin:create -- admin@example.com "Full Name"
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { db } from "@/server/db";
import { hashPassword, passwordSchema } from "@/server/auth/password";
import { audit } from "@/server/audit";

async function readHidden(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
  let muted = false;
  out._writeToOutput = (s: string) => {
    if (!muted) out.output.write(s);
  };
  const p = rl.question(prompt);
  muted = true;
  const answer = await p;
  rl.close();
  process.stdout.write("\n");
  return answer;
}

async function main() {
  const [email, ...nameParts] = process.argv.slice(2);
  if (!email || !email.includes("@")) {
    console.error('Usage: npm run admin:create -- <email> "<name>"');
    process.exit(1);
  }
  const name = nameParts.join(" ") || "Administrator";
  const password = await readHidden("Password (min 12 chars, letters and numbers): ");
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    console.error(parsed.error.issues.map((i) => i.message).join(" "));
    process.exit(1);
  }
  if ((await readHidden("Repeat password: ")) !== password) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
  const passwordHash = await hashPassword(password);
  const user = await db.staffUser.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), name, role: "SUPER_ADMIN", passwordHash },
    update: { passwordHash, role: "SUPER_ADMIN", isActive: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
  });
  await audit({ actorType: "SYSTEM", action: "staff.super_admin_cli", targetType: "StaffUser", targetId: user.id });
  console.log(`Super admin ready: ${user.email}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
