import "server-only";
import { hash, verify } from "@node-rs/argon2";
import { z } from "zod";

// Argon2id (algorithm 2) with OWASP-recommended parameters.
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128)
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9]/.test(p), "Use letters and numbers.");

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string, password: string): Promise<boolean> {
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** A real hash used to keep login timing constant when the account does not exist. */
let dummyHash: Promise<string> | undefined;
export function getDummyHash() {
  dummyHash ??= hashPassword("timing-equaliser-not-a-real-password-1");
  return dummyHash;
}
