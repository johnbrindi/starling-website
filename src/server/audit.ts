import "server-only";
import type { ActorType, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { redact } from "./logger";

export interface AuditInput {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

/** Records a security-relevant event. Metadata is redacted before storage. */
export async function audit(input: AuditInput, tx: Tx = db) {
  await tx.auditEvent.create({
    data: {
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      ipAddress: input.ipAddress,
      metadata: (redact(input.metadata ?? {}) ?? {}) as Prisma.InputJsonValue,
    },
  });
}
