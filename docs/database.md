# Database

PostgreSQL via Prisma 7 (`prisma/schema.prisma`, driver adapter `@prisma/adapter-pg`). Timestamps are UTC, and money is integer XAF.

## Entities

| Model | Purpose | Key constraints |
|---|---|---|
| `StaffUser`, `PasswordResetToken` | Operator accounts (Argon2id), single-use reset tokens (hashed) | unique email |
| `Session` | Server-side sessions for staff and customers; cookie holds a random token, DB stores SHA-256 | unique tokenHash |
| `Customer` | Phone-identified buyer (E.164) | unique phone |
| `Package` | Sellable pass: price, promo, duration, data, speed, devices, status | unique slug |
| `NetworkProfile` | Mapping to a router hotspot user profile | unique routerName |
| `Payment` | One Mobile Money attempt | unique reference, unique idempotencyKey, unique (provider, providerReference) |
| `WebhookEvent` | Every provider callback, stored once | unique (provider, eventKey) |
| `Voucher` | Prepaid card (hash only) | unique codeHash |
| `Subscription` | One paid period, snapshot of the package | **unique paymentId**, **unique voucherId** (exactly one period per payment/card) |
| `AccessCredential` | The access code = router user; validity window, limits, provisioning state, usage | unique username |
| `NetworkSession` | A device session seen on the router / in accounting | unique (externalId, startedAt) |
| `Notification`, `PushSubscription` | In-app + Web Push notices | unique dedupeKey, unique endpoint |
| `Job` | Durable background jobs with retries / dead-letter | unique dedupeKey (while unfinished) |
| `AuditEvent` | Security-relevant actions, redacted metadata | indexed by time/target/action |
| `IntegrationStatus`, `Setting`, `RateLimitBucket` | Health snapshots, admin settings, rate limiting | |

Relationships: `Payment 1─0..1 Subscription n─1 AccessCredential 1─n NetworkSession`. A credential can carry several subscriptions when renewals are stacked on the same code.

## Integrity rules (enforced in code and constraints)

* A subscription is only created inside `grantEntitlement`, inside the same transaction as the payment's conditional `PENDING → SUCCEEDED` update (or the voucher's `UNUSED → REDEEMED`).
* Per-customer entitlement changes take a `SELECT … FOR UPDATE` lock on the customer row, so concurrent renewals can't lose time.
* Expiry is a conditional update (`status = ACTIVE AND validUntil <= now`), so running it twice changes nothing.
* Crash recovery: reconciliation finds `SUCCEEDED` payments with no subscription and repairs them. It also finds entitled credentials missing from the router and re-provisions them, and removes router users that are no longer entitled.

## Migrations

```bash
npm run db:deploy        # apply committed migrations (production, CI, Supabase)
npm run db:migrate       # create a new migration while developing (interactive, local DB)
npx prisma migrate status
```

Migrations live in `prisma/migrations/`. Never edit an applied migration; add a new one. The Supabase database was initialised with `prisma migrate deploy` (migrations `init` and `vouchers`).

## Seed

`npm run db:seed` (idempotent):

* Always ensures the six packages from the business price list and two speed profiles. It never overwrites prices changed in the console.
* Development only: staff `admin@starling.local` and `support@starling.local` with known passwords, plus a demo customer with a simulated payment.
* Production (`NODE_ENV=production`): **no staff accounts, no demo data**. Create the first admin with `npm run admin:create`.

## Backups and recovery

* Supabase: daily backups are included on paid plans; enable Point-in-Time Recovery for production. Free-tier projects have no downloadable backups, so take your own.
* Own backups (daily cron on the VPS): `pg_dump "$DATABASE_URL" -Fc -f starling-$(date +%F).dump`. Keep 14 dailies and 6 monthlies, off the server.
* **Back up `ENCRYPTION_KEY` separately** (password manager). Without it, stored access codes can't be decrypted. Payments and history remain readable.
* Restore test (quarterly): `pg_restore -d <empty db> starling-YYYY-MM-DD.dump`, point a staging app at it, run `npm run router:check` against the fake adapter.

## Retention

Automatic: finished jobs after 14 days, webhook payloads after 180 days, expired sessions and rate-limit buckets hourly. Payment, subscription and audit records are kept for accounting. Confirm the required period with your accountant (see [access-control](access-control.md#compliance-items-to-confirm)).
