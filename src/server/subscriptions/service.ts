import "server-only";
import type { AccessCredential, Job, Package } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import { decrypt, encrypt, randomCode, sha256 } from "../crypto";
import { audit } from "../audit";
import { AppError } from "../errors";
import { enqueue, RetrySoon } from "../jobs/queue";
import { log } from "../logger";
import { getNetworkAdapter } from "../network";
import { getSettings, type Settings } from "../settings";
import { notify } from "../notifications/service";

const MB = 1024n * 1024n;

/** Generates a unique 8-character access code (31^8 ≈ 8.5e11 combinations). */
async function newUsername(tx: Tx): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomCode(8);
    if (!(await tx.accessCredential.findUnique({ where: { username: code } }))) return code;
  }
  throw new Error("Could not allocate a unique access code");
}

/** The authoritative entitlement rule. The UI countdown is display only; this decides access. */
export function isEntitled(c: Pick<AccessCredential, "status" | "validFrom" | "validUntil">, now = new Date()): boolean {
  return c.status === "ACTIVE" && c.validFrom <= now && now < c.validUntil;
}

export function credentialPassword(c: Pick<AccessCredential, "passwordEnc">): string {
  return decrypt(c.passwordEnc);
}

export interface FulfilResult {
  subscriptionId: string;
  credentialId: string;
  created: boolean;
}

interface GrantInput {
  customerId: string;
  pkg: Package;
  priceXaf: number;
  paymentId?: string;
  voucherId?: string;
  settings: Settings;
  now: Date;
}

/**
 * Creates one subscription period and the matching credential change, inside the caller's transaction.
 * EXTEND mode stacks the period after the current expiry on the same code; otherwise a new code starts now.
 */
async function grantEntitlement(tx: Tx, g: GrantInput) {
  // Serialise all entitlement changes for this customer (prevents lost updates on parallel renewals).
  await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${g.customerId} FOR UPDATE`;
  const { pkg, now } = g;
  const durationMs = pkg.durationMinutes * 60_000;
  const addBytes = pkg.dataLimitMb ? BigInt(pkg.dataLimitMb) * MB : null;
  const profileName = pkg.networkProfileId
    ? ((await tx.networkProfile.findUnique({ where: { id: pkg.networkProfileId } }))?.routerName ?? null)
    : null;

  let credential: AccessCredential | null = null;
  if (g.settings.renewalMode === "EXTEND") {
    credential = await tx.accessCredential.findFirst({
      where: { customerId: g.customerId, status: "ACTIVE", validUntil: { gt: now } },
      orderBy: { validUntil: "desc" },
    });
  }

  let startsAt: Date;
  if (credential) {
    startsAt = credential.validUntil;
    credential = await tx.accessCredential.update({
      where: { id: credential.id },
      data: {
        validUntil: new Date(startsAt.getTime() + durationMs),
        dataLimitBytes: credential.dataLimitBytes !== null && addBytes !== null ? credential.dataLimitBytes + addBytes : null,
        rateLimit: pkg.rateLimit,
        maxDevices: pkg.maxDevices,
        networkProfileName: profileName,
        provisionState: "PENDING",
      },
    });
  } else {
    startsAt = now;
    const username = await newUsername(tx);
    credential = await tx.accessCredential.create({
      data: {
        customerId: g.customerId,
        username,
        passwordEnc: encrypt(username),
        validFrom: now,
        validUntil: new Date(now.getTime() + durationMs),
        dataLimitBytes: addBytes,
        rateLimit: pkg.rateLimit,
        maxDevices: pkg.maxDevices,
        networkProfileName: profileName,
      },
    });
  }

  const subscription = await tx.subscription.create({
    data: {
      customerId: g.customerId,
      packageId: pkg.id,
      paymentId: g.paymentId ?? null,
      voucherId: g.voucherId ?? null,
      credentialId: credential.id,
      status: startsAt > now ? "SCHEDULED" : "ACTIVE",
      priceXaf: g.priceXaf,
      durationMinutes: pkg.durationMinutes,
      dataLimitMb: pkg.dataLimitMb,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMs),
    },
  });

  await enqueue("PROVISION_CREDENTIAL", { credentialId: credential.id }, { dedupeKey: `provision:${credential.id}`, maxAttempts: 20 }, tx);
  await audit(
    {
      actorType: "SYSTEM",
      action: "subscription.created",
      targetType: "Subscription",
      targetId: subscription.id,
      metadata: { paymentId: g.paymentId, voucherId: g.voucherId, packageId: pkg.id, renewal: startsAt > now, credentialId: credential.id },
    },
    tx,
  );
  return { subscription, credential };
}

/**
 * Turns a VERIFIED successful payment into exactly one subscription.
 * Must only be called after the provider confirmed success server-side.
 * Idempotent: a second call for the same payment returns the existing subscription.
 */
export async function fulfilPayment(paymentId: string, opts: { settings?: Settings; now?: Date } = {}): Promise<FulfilResult> {
  const settings = opts.settings ?? (await getSettings());
  const result = await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { package: true, subscription: true } });
    if (!payment) throw new AppError("NOT_FOUND", "Payment not found");
    if (payment.subscription) {
      return { subscriptionId: payment.subscription.id, credentialId: payment.subscription.credentialId, created: false, customerId: null, pkgName: null };
    }
    // Only a PENDING (or already verified) payment may be fulfilled. Failed/cancelled never grant access.
    const moved = await tx.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { status: "SUCCEEDED", verifiedAt: new Date() },
    });
    if (moved.count === 0 && payment.status !== "SUCCEEDED") {
      throw new AppError("CONFLICT", `Payment is ${payment.status.toLowerCase()} and cannot grant access`);
    }
    const { subscription, credential } = await grantEntitlement(tx, {
      customerId: payment.customerId,
      pkg: payment.package,
      priceXaf: payment.amountXaf,
      paymentId: payment.id,
      settings,
      now: opts.now ?? new Date(),
    });
    return { subscriptionId: subscription.id, credentialId: credential.id, created: true, customerId: payment.customerId, pkgName: payment.package.name };
  });

  if (result.created && result.customerId) {
    await notify(result.customerId, {
      type: "PAYMENT_SUCCEEDED",
      title: "Payment received",
      body: `Your ${result.pkgName} pass is confirmed. Your access code is ready.`,
      dedupeKey: `paid:${paymentId}`,
    });
  }
  return { subscriptionId: result.subscriptionId, credentialId: result.credentialId, created: result.created };
}

export function normaliseVoucherCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Redeems a prepaid voucher for a customer. Exactly-once: the UNUSED -> REDEEMED transition is a
 * conditional update and Subscription.voucherId is unique.
 */
export async function redeemVoucher(customerId: string, code: string, now = new Date()) {
  const settings = await getSettings();
  const codeHash = sha256(`voucher:${normaliseVoucherCode(code)}`);
  return db.$transaction(async (tx) => {
    // Row lock: a concurrent redemption of the same card waits here, then sees the final state.
    await tx.$queryRaw`SELECT "id" FROM "Voucher" WHERE "codeHash" = ${codeHash} FOR UPDATE`;
    const voucher = await tx.voucher.findUnique({ where: { codeHash }, include: { package: true, subscription: true } });
    const invalid = new AppError("BAD_REQUEST", "This voucher code is not valid.");
    if (!voucher) throw invalid;
    if (voucher.status === "REDEEMED") {
      // Same customer retrying (e.g. double tap) gets the same result; anyone else is refused.
      if (voucher.redeemedById === customerId && voucher.subscription) return { subscriptionId: voucher.subscription.id, credentialId: voucher.subscription.credentialId, created: false };
      throw new AppError("CONFLICT", "This voucher has already been used.");
    }
    if (voucher.status === "VOID") throw invalid;
    if (voucher.expiresAt && voucher.expiresAt <= now) throw new AppError("BAD_REQUEST", "This voucher has expired.");
    if (voucher.package.status === "ARCHIVED") throw invalid;
    const claimed = await tx.voucher.updateMany({
      where: { id: voucher.id, status: "UNUSED" },
      data: { status: "REDEEMED", redeemedById: customerId, redeemedAt: now },
    });
    if (claimed.count === 0) throw new AppError("CONFLICT", "This voucher has already been used.");
    const { subscription, credential } = await grantEntitlement(tx, {
      customerId,
      pkg: voucher.package,
      priceXaf: voucher.package.priceXaf,
      voucherId: voucher.id,
      settings,
      now,
    });
    await audit({ actorType: "CUSTOMER", actorId: customerId, action: "voucher.redeemed", targetType: "Voucher", targetId: voucher.id }, tx);
    return { subscriptionId: subscription.id, credentialId: credential.id, created: true };
  });
}

/** Staff: generates a batch of prepaid vouchers. Plain codes are returned once and never stored. */
export async function generateVouchers(input: { packageId: string; count: number; batch: string; expiresAt: Date | null }, staffId: string) {
  const pkg = await db.package.findUnique({ where: { id: input.packageId } });
  if (!pkg || pkg.status === "ARCHIVED") throw new AppError("NOT_FOUND", "Package not found.");
  const codes: string[] = [];
  for (let i = 0; i < input.count; i++) codes.push(randomCode(12));
  await db.voucher.createMany({
    data: codes.map((c) => ({
      codeHash: sha256(`voucher:${c}`),
      codeHint: c.slice(-3),
      batch: input.batch,
      packageId: pkg.id,
      expiresAt: input.expiresAt,
      createdById: staffId,
    })),
  });
  await audit({ actorType: "STAFF", actorId: staffId, action: "voucher.batch_created", targetType: "Package", targetId: pkg.id, metadata: { batch: input.batch, count: input.count } });
  return { package: pkg, codes: codes.map((c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`) };
}

/** Job: push a credential to the network and confirm. */
export async function provisionCredentialJob(job: Job) {
  const { credentialId } = job.payload as { credentialId: string };
  const settings = await getSettings();
  const c = await db.accessCredential.findUnique({ where: { id: credentialId } });
  if (!c) return;
  const now = new Date();
  if (!isEntitled(c, now)) {
    if (c.status === "ACTIVE" && c.validFrom > now) throw new RetrySoon("Credential not yet valid", c.validFrom.getTime() - now.getTime());
    // Expired/revoked while queued: make sure it is removed instead.
    await enqueue("DEPROVISION_CREDENTIAL", { credentialId }, { dedupeKey: `deprovision:${credentialId}` });
    return;
  }
  const adapter = getNetworkAdapter();
  try {
    await adapter.provisionUser({
      credentialId: c.id,
      username: c.username,
      password: credentialPassword(c),
      profile: c.networkProfileName,
      validUntil: c.validUntil,
      limitUptimeSeconds: Math.ceil((c.validUntil.getTime() - now.getTime()) / 1000),
      limitBytesTotal: c.dataLimitBytes,
      maxDevices: c.maxDevices,
      rateLimit: c.rateLimit,
      routerSideExpiry: settings.routerExpiryScheduler,
    });
  } catch (err) {
    await db.accessCredential.update({
      where: { id: c.id },
      data: { provisionState: "FAILED", lastSyncError: (err as Error).message.slice(0, 500) },
    });
    throw err;
  }
  // Only mark PROVISIONED if nothing changed while we were talking to the router.
  const marked = await db.accessCredential.updateMany({
    where: { id: c.id, status: "ACTIVE", validUntil: c.validUntil },
    data: { provisionState: "PROVISIONED", provisionedAt: new Date(), provisionedUntil: c.validUntil, lastSyncError: null },
  });
  if (marked.count === 0) throw new RetrySoon("Credential changed during provisioning; re-pushing", 500);
  if (job.attempts === 1 || c.provisionState !== "PROVISIONED") {
    await notify(c.customerId, {
      type: "ACCESS_READY",
      title: "Wi-Fi access ready",
      body: `Your code ${c.username} is active. Tap Connect to go online.`,
      dedupeKey: `ready:${c.id}:${c.validUntil.getTime()}`,
    });
  }
}

/** Job: remove a credential from the network and end its sessions. */
export async function deprovisionCredentialJob(job: Job) {
  const { credentialId } = job.payload as { credentialId: string };
  const c = await db.accessCredential.findUnique({ where: { id: credentialId } });
  if (!c) return;
  if (isEntitled(c)) {
    // Renewed in the meantime: nothing to remove.
    return;
  }
  const adapter = getNetworkAdapter();
  // Remove first so the device cannot log straight back in, then end any live sessions.
  await adapter.removeUser(c.username);
  await adapter.disconnectUser(c.username);
  await db.accessCredential.updateMany({
    where: { id: c.id, status: { not: "ACTIVE" } },
    data: { provisionState: "REMOVED", lastSyncError: null },
  });
  await db.networkSession.updateMany({
    where: { credentialId: c.id, endedAt: null },
    data: { endedAt: new Date(), endReason: c.status === "REVOKED" ? "revoked" : "expired" },
  });
}

/**
 * Expires every credential whose validUntil has passed. Idempotent and safe to run concurrently:
 * each row moves ACTIVE -> EXPIRED with a conditional update.
 */
export async function expireDue(now = new Date()): Promise<number> {
  // Bookkeeping: stacked subscriptions whose start has arrived become ACTIVE.
  await db.subscription.updateMany({ where: { status: "SCHEDULED", startsAt: { lte: now } }, data: { status: "ACTIVE" } });

  const due = await db.accessCredential.findMany({
    where: { status: "ACTIVE", validUntil: { lte: now } },
    select: { id: true, customerId: true, username: true },
    take: 200,
  });
  let expired = 0;
  for (const c of due) {
    const changed = await db.$transaction(async (tx) => {
      const moved = await tx.accessCredential.updateMany({
        where: { id: c.id, status: "ACTIVE", validUntil: { lte: now } },
        data: { status: "EXPIRED", provisionState: "DEPROVISION_PENDING" },
      });
      if (moved.count === 0) return false;
      await tx.subscription.updateMany({
        where: { credentialId: c.id, status: { in: ["ACTIVE", "SCHEDULED"] } },
        data: { status: "EXPIRED" },
      });
      await enqueue("DEPROVISION_CREDENTIAL", { credentialId: c.id }, { dedupeKey: `deprovision:${c.id}`, maxAttempts: 30 }, tx);
      await audit({ actorType: "SYSTEM", action: "credential.expired", targetType: "AccessCredential", targetId: c.id }, tx);
      return true;
    });
    if (changed) {
      expired++;
      await notify(c.customerId, {
        type: "EXPIRED",
        title: "Your Wi-Fi time has ended",
        body: "Your access has expired. Buy a new pass to continue browsing.",
        dedupeKey: `expired:${c.id}:${now.toISOString().slice(0, 16)}`,
      });
    }
  }
  if (expired) log.info("Expired credentials", { count: expired });
  return expired;
}

/** Staff action: revoke access immediately. */
export async function revokeCredential(credentialId: string, staffId: string, reason: string, ip?: string) {
  const c = await db.$transaction(async (tx) => {
    const cred = await tx.accessCredential.findUnique({ where: { id: credentialId } });
    if (!cred) throw new AppError("NOT_FOUND", "Credential not found");
    if (cred.status === "REVOKED") return cred;
    await tx.accessCredential.update({ where: { id: cred.id }, data: { status: "REVOKED", provisionState: "DEPROVISION_PENDING" } });
    await tx.subscription.updateMany({
      where: { credentialId: cred.id, status: { in: ["ACTIVE", "SCHEDULED"] } },
      data: { status: "REVOKED", revokedAt: new Date(), revokedReason: reason },
    });
    await enqueue("DEPROVISION_CREDENTIAL", { credentialId: cred.id }, { dedupeKey: `deprovision:${cred.id}`, maxAttempts: 30 }, tx);
    await audit(
      { actorType: "STAFF", actorId: staffId, action: "credential.revoked", targetType: "AccessCredential", targetId: cred.id, ipAddress: ip, metadata: { reason } },
      tx,
    );
    return cred;
  });
  await notify(c.customerId, {
    type: "REVOKED",
    title: "Access revoked",
    body: "Your Wi-Fi access was ended by support. Contact us if you think this is a mistake.",
    dedupeKey: `revoked:${c.id}`,
  });
}
