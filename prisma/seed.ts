/**
 * Seeds the catalogue from the business price list and, in development only, demo data.
 *   npm run db:seed
 * Production: packages are seeded (idempotent upsert by slug); NO staff account is created.
 * Create the first administrator with:  npm run admin:create
 */
import "dotenv/config";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/password";
import { encrypt } from "@/server/crypto";

// Price list supplied by the business (handwritten sheet). All editable later in the admin console.
const PACKAGES = [
  { slug: "1-hour", name: "1 Hour", priceXaf: 100, durationMinutes: 60, description: "Quick browsing, messages and social media.", sortOrder: 10 },
  { slug: "12-hours", name: "12 Hours", priceXaf: 150, durationMinutes: 12 * 60, description: "Half a day of internet.", sortOrder: 20 },
  { slug: "24-hours", name: "24 Hours", priceXaf: 200, durationMinutes: 24 * 60, description: "A full day of internet.", sortOrder: 30, isFeatured: true },
  { slug: "1-week", name: "1 Week", priceXaf: 1350, durationMinutes: 7 * 24 * 60, description: "Seven days of internet.", sortOrder: 40 },
  { slug: "2-weeks", name: "2 Weeks", priceXaf: 2500, durationMinutes: 14 * 24 * 60, description: "Fourteen days of internet.", sortOrder: 50 },
  { slug: "1-month", name: "1 Month", priceXaf: 4500, durationMinutes: 30 * 24 * 60, description: "Thirty days of internet. Best value.", sortOrder: 60, maxDevices: 2 },
];

const POLICY = "Fair use: very heavy downloads may be slowed at busy times so everyone gets a good connection.";

async function main() {
  const isProd = process.env.NODE_ENV === "production";

  const profile = await db.networkProfile.upsert({
    where: { routerName: "starling-default" },
    create: { routerName: "starling-default", description: "Default customer speed", rateLimit: "2M/4M", sharedUsers: 1, idleTimeout: "10m" },
    update: {},
  });
  const profile2 = await db.networkProfile.upsert({
    where: { routerName: "starling-2dev" },
    create: { routerName: "starling-2dev", description: "Two devices", rateLimit: "2M/4M", sharedUsers: 2, idleTimeout: "10m" },
    update: {},
  });

  for (const p of PACKAGES) {
    const maxDevices = p.maxDevices ?? 1;
    await db.package.upsert({
      where: { slug: p.slug },
      create: { ...p, maxDevices, usagePolicy: POLICY, networkProfileId: maxDevices > 1 ? profile2.id : profile.id },
      update: {}, // never overwrite prices an administrator has changed
    });
  }
  console.log(`Packages: ${PACKAGES.length} ensured`);

  if (isProd) {
    console.log("Production: no demo data or staff accounts seeded. Run `npm run admin:create`.");
    return;
  }

  // ── Development fixtures (clearly fake) ──
  const devEmail = "admin@starling.local";
  if (!(await db.staffUser.findUnique({ where: { email: devEmail } }))) {
    await db.staffUser.create({ data: { email: devEmail, name: "Dev Admin", role: "SUPER_ADMIN", passwordHash: await hashPassword("starling-dev-admin-1") } });
    await db.staffUser.create({ data: { email: "support@starling.local", name: "Dev Support", role: "SUPPORT", passwordHash: await hashPassword("starling-dev-support-1") } });
    console.log("Dev staff: admin@starling.local / starling-dev-admin-1 (SUPER_ADMIN), support@starling.local / starling-dev-support-1 (SUPPORT)");
  }

  const demoPhone = "+237670000090";
  if (!(await db.customer.findUnique({ where: { phone: demoPhone } }))) {
    const pkg = await db.package.findUniqueOrThrow({ where: { slug: "24-hours" } });
    const customer = await db.customer.create({
      data: { phone: demoPhone, name: "Demo Customer", passwordHash: await hashPassword("demo-customer-1"), passwordChangedAt: new Date() },
    });
    const now = new Date();
    const payment = await db.payment.create({
      data: {
        reference: "SW-DEMO-0000000001",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        customerId: customer.id,
        packageId: pkg.id,
        amountXaf: pkg.priceXaf,
        provider: "SIMULATOR",
        isSimulated: true,
        channel: "cm.mtn",
        payerPhone: demoPhone,
        status: "SUCCEEDED",
        verifiedAt: now,
        expiresAt: now,
      },
    });
    const code = "DEMO2345";
    const cred = await db.accessCredential.create({
      data: {
        customerId: customer.id,
        username: code,
        passwordEnc: encrypt(code),
        validFrom: now,
        validUntil: new Date(now.getTime() + pkg.durationMinutes * 60_000),
        maxDevices: 1,
        networkProfileName: "starling-default",
      },
    });
    await db.subscription.create({
      data: {
        customerId: customer.id,
        packageId: pkg.id,
        paymentId: payment.id,
        credentialId: cred.id,
        status: "ACTIVE",
        priceXaf: pkg.priceXaf,
        durationMinutes: pkg.durationMinutes,
        startsAt: now,
        endsAt: cred.validUntil,
      },
    });
    await db.job.create({ data: { type: "PROVISION_CREDENTIAL", payload: { credentialId: cred.id }, dedupeKey: `provision:${cred.id}` } });
    console.log(`Demo customer: phone 670000090 / password demo-customer-1, code DEMO-2345 (simulated payment)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
