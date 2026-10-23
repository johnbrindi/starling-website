# Development setup

## Requirements

* Node.js 20.19+ (tested on 24), npm 10+
* Docker (local PostgreSQL 17 for development and tests)
* Optional: Google Chrome for the end-to-end tests (or run `npx playwright install chromium`)

## Steps

```bash
npm install
docker compose up -d postgres
cp .env.example .env
npm run keys:generate        # paste SESSION_SECRET, ENCRYPTION_KEY, CRON_SECRET, VAPID keys into .env
```

Choose a database in `.env`:

* **Local sandbox (recommended for development):** `DATABASE_URL=postgresql://starling:starling_dev_only@127.0.0.1:54329/starling`
* **Supabase:** the IPv4 session pooler URL (see [environment-variables](environment-variables.md#database_url)). The project's `.env` is already set up this way. The direct host `db.<ref>.supabase.co` is IPv6-only and won't work from IPv4-only networks.

```bash
npm run db:deploy            # apply migrations
npm run db:seed              # price list; in development also dev staff + demo customer
npm run dev                  # http://localhost:3000
npm run worker               # in a second terminal
```

| URL | What |
|---|---|
| `/` | Customer home (plans) |
| `/portal?login=http%3A%2F%2F10.5.50.1%2Flogin&mac=AA:BB:CC:DD:EE:FF&ip=10.5.50.20` | Simulates arriving from the MikroTik login page |
| `/register`, `/login` | Customer account (demo: `670000090` / `demo-customer-1`) |
| `/account` | My Wi-Fi: access code, countdown, how-to guide |
| `/admin` | Console (`admin@starling.local` / `starling-dev-admin-1`) |

## Simulated integrations (development only)

* **Payment simulator** (`PAYMENT_PROVIDER=simulator`, `ALLOW_SIMULATED_PAYMENTS=true`). Payments are flagged `isSimulated`, shown with a *Test mode* banner, and excluded from revenue. The outcome depends on the last digit of the phone number: `0` succeeds, `1`/`2` fail, `4` cancels, anything else waits for the *Simulate approve/decline* buttons. Activation still goes through the same server-side `verifyPayment` path.
* **Fake router** (`NETWORK_ADAPTER=fake`, `ALLOW_FAKE_NETWORK=true`). This is a simulated MikroTik whose state lives in the `Setting` table, so the web app and worker share it. It enforces passwords, expiry and device limits. *Simulate connect* on the access page logs the current browser in as a device.

Both refuse to load when `NODE_ENV=production` (environment validation fails at startup).

## Useful scripts

| Command | Purpose |
|---|---|
| `npm run admin:create -- you@example.com "Your Name"` | Create or reset a super admin (password typed interactively) |
| `npm run router:check` | Read-only diagnostics against the configured router |
| `npm run db:validate` | Validate the Prisma schema |
| `npx prisma studio` | Browse the database |

## Conventions

* Server-only code lives in `src/server/**` and imports `server-only`, so it can't end up in a client bundle. Scripts and the worker run with `tsx --conditions=react-server`.
* Prices are integer XAF and times are UTC `DateTime`.
* Every admin mutation goes through `staffRoute(permission, …)`.
