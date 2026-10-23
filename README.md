# Starling Wi-Fi

Paid public Wi-Fi for a **Starlink → MikroTik HotSpot → Tenda outdoor AP** network. Customers join the open Wi-Fi, land on a captive portal, buy a pass in **XAF** with **MTN Mobile Money or Orange Money**, receive an access code, and are logged in by the MikroTik. When the time runs out, the router removes them, they are warned beforehand, and the portal invites them to renew.

Built with Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, PostgreSQL (Supabase) and Prisma 7. Installable as a PWA.

## What it does

| Area | Highlights |
|---|---|
| Customer portal | Customer accounts (name, phone, password; sign-in, password reset), mobile-first plans page, Mobile Money checkout (USSD push), live payment status, access code + **Connect** button, server-authoritative countdown, expiry warnings (in-app, local and Web Push), renewal, purchase history, voucher-card redemption, recovery with phone + code, help/terms/privacy |
| Payments | Provider interface; **Notch Pay** direct charge (Cameroon MTN/Orange); clearly labelled **simulator** for development (refused in production). Server-side verification only, HMAC-verified idempotent webhooks, idempotency keys, amount/currency/reference matching, reconciliation of delayed/missing webhooks and crash recovery |
| Entitlements | One subscription per verified payment (DB-enforced), configurable renewal (stack on same code or new code), expiry state machine, revocation, prepaid vouchers (exactly-once) |
| Captive portal on the router | Branded `login.html` served by the MikroTik (works even when the internet is down) with *Access code* and *Username & password* tabs, live *Time left* status page, after-login page. Preview them without a router at `/api/dev/hotspot-preview?page=login` |
| MikroTik | Native **RouterOS v6 API** client (no v7 REST dependency) for the hAP lite on 6.48/6.49: provisioning hotspot users with limits, profile sync, active-session sync, disconnects, reconciliation, read-only config validation, optional router-side expiry scheduler. Optional **RADIUS** mode (FreeRADIUS SQL views + RFC 5176 disconnects). **Fake router** for development |
| Enforcement | Background worker expires access on time, removes users and kicks sessions; session sync disconnects anyone not entitled regardless of what a browser shows |
| Admin console | Role-based (super admin, admin, support, viewer), **Sell a pass** (cash counter sales that create a username + password, with a printable slip), dashboard (live vs simulated clearly separated), packages, customers, payments, vouchers, network health/actions/profiles/sessions/sync errors, settings, staff, audit log |
| Security | Argon2id, server-side sessions (`__Host-` cookies), CSRF (origin + token), rate limits, account lockout, strict CSP and security headers, AES-256-GCM for stored codes, redacted structured logs, deny-by-default RBAC, production guards against fake payments/routers |

## Quick start (development)

```bash
npm install
docker compose up -d postgres            # local Postgres for dev and tests
cp .env.example .env                     # then: npm run keys:generate and paste the secrets
# point DATABASE_URL at the local DB for a sandbox:
#   postgresql://starling:starling_dev_only@127.0.0.1:54329/starling
npm run db:deploy && npm run db:seed     # schema + price list + dev accounts
npm run dev                              # http://localhost:3000
npm run worker                           # second terminal: expiry, provisioning, sync
```

Dev logins (development seed, **local database only**): admin console `admin@starling.local / starling-dev-admin-1`, support `support@starling.local / starling-dev-support-1`; demo customer phone `670000090` / password `demo-customer-1` (code `DEMO-2345`). On Supabase/production no accounts are seeded: create your admin with `npm run admin:create -- you@example.com "Your Name"`. With the simulator, phone numbers ending in **0** succeed, **1** fail, **4** cancel, others wait for the on-screen *Simulate approve/decline* buttons.

## Checks

```bash
npm run lint && npm run typecheck && npm test   # unit + integration (local Postgres)
npm run test:e2e                                # Playwright, mobile Chrome, isolated DB
npm run build
```

## Documentation

| Doc | Contents |
|---|---|
| [architecture](docs/architecture.md) | Components, data flow, design decisions (HotSpot API vs RADIUS) |
| [development-setup](docs/development-setup.md) | Local setup, simulator, fake router |
| [environment-variables](docs/environment-variables.md) | Every variable, safe values |
| [database](docs/database.md) | Schema, state machines, migrations, seed, backups |
| [payments](docs/payments.md) | Notch Pay setup, webhooks, testing, reconciliation |
| [mikrotik-integration](docs/mikrotik-integration.md) | RouterOS API method and prerequisites |
| [network-integration-guide](docs/network-integration-guide.md) | **Step-by-step: Starlink + hAP lite + Tenda + this app** |
| [access-control](docs/access-control.md) | Roles, ACL policy, walled garden, firewall boundaries |
| [radius](docs/radius.md) | Optional FreeRADIUS mode |
| [deployment](docs/deployment.md) | VPS, TLS, DNS, VPN, backups, monitoring, updates |
| [troubleshooting](docs/troubleshooting.md) | Payment, portal, DHCP, DNS, login, expiry problems |
| [testing](docs/testing.md) | Test commands, scenarios, results |

## Repository layout

```
src/app/(site)/        customer pages (home, plans, pay, account, portal, help, legal)
src/app/admin/         operator console (login, reset, dashboard and management pages)
src/app/api/           JSON API (public, customer, admin, webhooks, cron, dev-only)
src/server/            server-only domain code
  auth/                sessions, passwords, RBAC, staff and customer auth
  payments/            provider interface, Notch Pay, simulator, payment service
  subscriptions/       entitlement grant, expiry, revocation, vouchers, status
  network/             adapter interface, RouterOS v6 API client/adapter, RADIUS, fake, sync
  notifications/       in-app + Web Push, expiry warnings
  jobs/                Postgres job queue and scheduler tick
src/components/        UI primitives, customer and admin components
worker/                long-running background worker
prisma/                schema, migrations, seed
network/mikrotik/      hotspot HTML templates and RouterOS scripts
network/radius/        optional FreeRADIUS SQL views and config
deploy/                production compose, Caddy, OpenVPN server example
tests/                 unit, integration, e2e
archive/               superseded ESP32 door-access proposal (kept for reference)
```

## Status of external dependencies

Live payments need Notch Pay merchant keys. Live network control needs the configured MikroTik reachable over the management VPN. Until then, the platform runs end to end with the simulator and fake router, and it refuses to start in production without real ones. See [docs/deployment.md](docs/deployment.md#launch-checklist).
