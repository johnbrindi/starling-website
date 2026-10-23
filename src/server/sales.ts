import "server-only";
import { z } from "zod";
import { normalizeCameroonPhone } from "@/lib/phone";
import { db } from "./db";
import { audit } from "./audit";
import { randomCode } from "./crypto";
import { env } from "./env";
import { AppError } from "./errors";
import { effectivePrice } from "./payments/service";
import { credentialPassword, fulfilPayment, type CredentialStyle } from "./subscriptions/service";

export const cashSaleSchema = z.object({
  packageId: z.string().min(1),
  phone: z.string().trim().min(9, "Enter the customer's phone number.").max(20),
  name: z.string().trim().max(60).optional().default(""),
  style: z.enum(["userpass", "code"]).default("userpass"),
  /** Client-generated; a double click records the sale once. */
  idempotencyKey: z.uuid(),
});

/**
 * Counter sale, cyber-café style: staff take cash and the system creates the customer's Wi-Fi
 * login (username + password, or a single access code). Recorded as a CASH payment so revenue,
 * history and audit include it. The customer can later create an online account with the same phone.
 */
export async function createCashSale(input: z.infer<typeof cashSaleSchema>, staffId: string, ip?: string) {
  const phone = normalizeCameroonPhone(input.phone);
  if (!phone) throw new AppError("VALIDATION_FAILED", "Enter a valid Cameroon mobile number.", [{ path: "phone", message: "Invalid number." }]);
  const pkg = await db.package.findUnique({ where: { id: input.packageId } });
  if (!pkg || pkg.status === "ARCHIVED") throw new AppError("NOT_FOUND", "Package not found.");
  // FreeRADIUS reads the password from the username (see network/radius/schema.sql), so RADIUS mode uses codes.
  const style: CredentialStyle = env().NETWORK_ADAPTER === "radius" ? "code" : input.style;

  let payment = await db.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (!payment) {
    const customer = await db.customer.upsert({
      where: { phone },
      create: { phone, name: input.name || null },
      update: input.name ? { name: input.name } : {},
    });
    if (customer.isBlocked) throw new AppError("FORBIDDEN", "This customer is blocked.");
    const now = new Date();
    payment = await db.payment.create({
      data: {
        reference: `SW-CASH-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomCode(8)}`,
        idempotencyKey: input.idempotencyKey,
        customerId: customer.id,
        packageId: pkg.id,
        amountXaf: effectivePrice(pkg).amount,
        provider: "CASH",
        status: "SUCCEEDED",
        verifiedAt: now,
        payerPhone: phone,
        recordedById: staffId,
        expiresAt: now,
      },
    });
    await audit({ actorType: "STAFF", actorId: staffId, action: "sale.cash", targetType: "Payment", targetId: payment.id, ipAddress: ip, metadata: { packageId: pkg.id, amount: payment.amountXaf } });
  }
  const { credentialId } = await fulfilPayment(payment.id, { style, nameHint: input.name || null });
  const cred = await db.accessCredential.findUniqueOrThrow({ where: { id: credentialId } });
  const password = credentialPassword(cred);
  return {
    paymentId: payment.id,
    customerId: payment.customerId,
    reference: payment.reference,
    packageName: pkg.name,
    amountXaf: payment.amountXaf,
    username: cred.username,
    password,
    style: cred.username === password ? ("code" as const) : ("userpass" as const),
    validUntil: cred.validUntil.toISOString(),
    maxDevices: cred.maxDevices,
  };
}
