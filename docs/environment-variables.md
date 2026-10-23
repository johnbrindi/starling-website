# Environment variables

Validated at startup by `src/server/env.ts` (Zod). If something is invalid the process refuses to start, and the error names the variable without printing its value. Generate secrets with `npm run keys:generate`. Never commit `.env*` files; only `.env.example` is tracked.

| Variable | Required | Example / default | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | `development` / `production` | Production forbids simulated payments and the fake router |
| `APP_URL` | yes | `https://wifi.example.cm` | Public URL; must be `https` in production. Used for origin (CSRF) checks, reset links and the walled garden check |
| `APP_NAME` | no | `Starling Wi-Fi` | |
| `TZ` | recommended | `Africa/Douala` | Server-rendered times in the admin console |
| `DATABASE_URL` | yes | see below | PostgreSQL connection string |
| `DATABASE_CA_CERT` | recommended (prod) | path or PEM | Enables full TLS verification (Supabase root CA) |
| `DATABASE_POOL_MAX` | no | `5` | Per process. Supabase session pooler allows a limited number of clients |
| `SESSION_SECRET` | yes | 48+ random bytes | Reserved for signing; must be ≥32 chars |
| `ENCRYPTION_KEY` | yes | 32 bytes base64 | AES-256-GCM key for stored access codes. **Rotating it makes existing codes unreadable**; back it up with the database |
| `CRON_SECRET` | yes | random | Bearer token for `POST /api/cron/tick` |
| `TRUST_PROXY` | prod: `true` behind Caddy | `false` | Trust `X-Forwarded-For` for client IPs (rate limits, audit) |
| `PAYMENT_PROVIDER` | yes | `simulator` / `notchpay` | |
| `ALLOW_SIMULATED_PAYMENTS` | dev only | `true` | Must be `false`/unset in production |
| `NOTCHPAY_BASE_URL` | no | `https://api.notchpay.co` | |
| `NOTCHPAY_PUBLIC_KEY` | with notchpay | `pk_test_…` / `pk_live_…` | Sent as `Authorization` header |
| `NOTCHPAY_PRIVATE_KEY` | no | | Only for webhook management/transfers (unused by the app at runtime) |
| `NOTCHPAY_WEBHOOK_HASH` | with notchpay | `hsk_…` | HMAC key for `x-notch-signature` |
| `NETWORK_ADAPTER` | yes | `fake` / `routeros` / `radius` | |
| `ALLOW_FAKE_NETWORK` | dev only | `true` | Must be `false`/unset in production |
| `ROUTER_HOST` | routeros | `10.99.0.2` | Router address **over the VPN**. Never a public IP |
| `ROUTER_PORT` | no | `8729` (TLS) / `8728` | |
| `ROUTER_TLS` | recommended | `true` | API-SSL |
| `ROUTER_TLS_INSECURE` | no | `true` with self-signed router cert | Traffic is still encrypted; set `false` if you install a CA-signed cert |
| `ROUTER_USERNAME` / `ROUTER_PASSWORD` | routeros | `starling-api` | The least-privilege API user (see `network/mikrotik/scripts/03-api-user.rsc`) |
| `ROUTER_HOTSPOT_SERVER` | no | `hotspot1` | Name of `/ip hotspot` server |
| `ROUTER_TIMEOUT_MS` | no | `8000` | Per command; Starlink latency spikes are tolerated |
| `HOTSPOT_LOGIN_URL` | no | `http://10.5.50.1/login` | Fallback router login URL for the *Connect* button |
| `RADIUS_NAS_HOST` / `RADIUS_COA_PORT` / `RADIUS_SECRET` | radius | `10.99.0.2` / `3799` | Disconnect-Request target |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | optional | | Web Push. Without them reminders are in-app/local only |
| `LOG_LEVEL` | no | `info` | `debug` for verbose logs (still redacted) |
| `WORKER_INTERVAL_MS` | no | `5000` | Worker loop period |

## DATABASE_URL

Supabase (this project, IPv4 session pooler, region eu-west-2):

```
postgresql://postgres.jxjskdnnhrsgebjniksq:<URL-ENCODED-PASSWORD>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true
```

* Percent-encode special characters in the password.
* `uselibpqcompat=true` gives `sslmode=require` its libpq meaning (encrypted, certificate not verified). For verified TLS, download the CA from *Supabase → Project Settings → Database → SSL Configuration* and set `DATABASE_CA_CERT=/path/to/prod-ca-2021.crt`.
* Use the **session** pooler (port 5432), not the transaction pooler (6543): the app uses interactive transactions and row locks.
