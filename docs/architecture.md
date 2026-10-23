# Architecture

## Topology

```
                         Internet
                            │
     ┌──────────────────────┴───────────────────────┐
     │ VPS (public, HTTPS)                          │
     │  Caddy (TLS) → Next.js web  ── Supabase Postgres (managed, eu-west-2)
     │               worker  ─────┘                 │
     │  OpenVPN server 10.99.0.1  ◄───── tunnel ───┐│      Notch Pay API ◄── server-to-server
     └─────────────────────────────────────────────┼┘      (USSD push to the customer's phone)
                                                   │
 Starlink dish ── Starlink router (bypass) ── ether1│MikroTik hAP lite (RouterOS 6.49.x)
                                                   │  OVPN client 10.99.0.2 (management only)
                                                   │  HotSpot on bridge-hotspot 10.5.50.1/24
                                   ether2 ─────────┴─ Tenda outdoor AP (bridge/AP mode, open SSID)
                                                          │
                                                   customer phones
```

* The web app, database, worker and payment processing run **off the router**. The hAP lite only does DHCP, DNS, NAT, the HotSpot and queues.
* Starlink uses CGNAT, so nothing on the internet can open a connection to the router. The router **dials out** an OpenVPN tunnel to the VPS, and the worker talks to the RouterOS API at `10.99.0.2:8729` (API-SSL) through it.
* Customers' phones only need the portal host before login (walled garden). Payment approval happens on the phone's own Mobile Money USSD menu, so there is no payment page to whitelist.

## Components

| Component | Responsibility |
|---|---|
| `src/app/(site)` | Customer UI: plans, checkout, payment status, access page with countdown/Connect, captive-portal entry `/portal`, vouchers, help, legal |
| `src/app/admin` | Staff UI, server-side permission checks on every page |
| `src/app/api` | JSON endpoints. Customer endpoints use the customer session; admin endpoints go through `staffRoute()` (auth + permission + origin + CSRF) |
| `server/payments` | `PaymentProviderAdapter` interface; `NotchPayProvider`; `SimulatorProvider` (dev); `service.ts`: checkout, **verifyPayment** (the only path to activation), webhooks, reconciliation |
| `server/subscriptions` | `grantEntitlement` (one transaction: subscription + credential + provisioning job), `fulfilPayment`, `redeemVoucher`, `expireDue`, `revokeCredential`, provisioning job handlers, `getAccessStatus` |
| `server/network` | `NetworkAdapter` interface; `RouterOsAdapter` (+ wire-protocol client); `RadiusAdapter`; `FakeNetworkAdapter`; `sync.ts`: health, session sync + enforcement, reconciliation, profile push, validation |
| `server/jobs` | Durable Postgres job queue (`FOR UPDATE SKIP LOCKED`, exponential backoff, dead-letter) and the scheduler `tick()` |
| `worker/` | Runs `tick()` every 5 s. `/api/cron/tick` runs the same pass for hosts without a long-lived process |

## Request and data flow

1. **Captive portal.** An unauthenticated device opens any HTTP site. The MikroTik serves `login.html`, which redirects to `APP_URL/portal?login=<router login URL>&mac=…&ip=…`. The portal stores the router login URL locally.
2. **Checkout.** `POST /api/checkout` validates the package and phone, creates a `Payment` (PENDING, idempotency key), and calls Notch Pay: create the payment, then direct charge on `cm.mtn` or `cm.orange`. The customer gets a USSD prompt and approves with their PIN. A customer session cookie is set.
3. **Verification.** The status page polls `GET /api/payments/:id`, which calls `verifyPayment`. A Notch Pay webhook (HMAC-verified, stored once) also triggers `verifyPayment`, and so does the worker's reconciliation. **Only** the provider's `GET /payments/{ref}` result with status `complete`, amount = expected, currency XAF, and a matching reference moves the payment to SUCCEEDED.
4. **Fulfilment.** In one DB transaction: payment `PENDING→SUCCEEDED` (conditional update), customer row lock, credential created or extended, `Subscription` created (`paymentId` UNIQUE), and a `PROVISION_CREDENTIAL` job enqueued.
5. **Provisioning.** The job, run immediately by the web request (fast path) or by the worker, calls `adapter.provisionUser`, which upserts the hotspot user (name/password = code, profile, `limit-uptime`, `limit-bytes-total`, comment `starling:<id>`), reads it back to confirm, and optionally adds a router scheduler that removes the user at expiry. Only then is the credential marked `PROVISIONED`.
6. **Login.** *Connect this device* navigates to `http://10.5.50.1/login?username=CODE&password=CODE&dst=…/account`. The router authenticates locally.
7. **Usage.** The worker polls `/ip hotspot active` and records `NetworkSession`s and byte counters. Any session whose credential is not entitled is disconnected immediately.
8. **Expiry.** `expireDue` moves `ACTIVE→EXPIRED` (conditional, idempotent) and enqueues deprovisioning, which removes the user and kicks the sessions. The customer sees *Your Wi-Fi time has ended* and can renew. Warnings go out at 15/5/1 minutes (configurable).

## State machines

```
Payment:      PENDING ──verified success──► SUCCEEDED ──► (Subscription created exactly once)
                 ├──provider failed──► FAILED
                 ├──provider cancelled──► CANCELLED
                 └──timeout──► EXPIRED ──(late provider success within 24 h)──► PENDING ─► SUCCEEDED

Credential:   ACTIVE ──validUntil passed──► EXPIRED          provisionState: PENDING → PROVISIONED
                 └──staff revoke──► REVOKED                                  ↘ FAILED (retry) ↗
                                                            EXPIRED/REVOKED → DEPROVISION_PENDING → REMOVED
Subscription: SCHEDULED (stacked) → ACTIVE → EXPIRED | REVOKED
```

Payment success, provisioning on the router, an authorised login, and an active session are tracked separately. The customer page shows *Activating*, *Active*, or *Online* accordingly.

## Key decisions

### HotSpot local users via the API (chosen) vs RADIUS

| | A. Local HotSpot users via RouterOS API **(default)** | B. HotSpot + FreeRADIUS (implemented, optional) |
|---|---|---|
| Works on hAP lite / v6.48 | Yes (API since forever; plain login since 6.43) | Yes |
| If the server/VPN is down | **Paying customers keep working**; router enforces limit-uptime + scheduler expiry | Nobody can log in (RADIUS unreachable) |
| Expiry precision | Server job + router scheduler (needs NTP) | Exact via `Session-Timeout` |
| Extra infrastructure | None beyond the VPN | FreeRADIUS server + DB role |
| Scale | Fine to a few hundred users per router | Many routers / sites |

Recommendation: **A** for this single site on a Starlink link. The link's outages must not lock out customers who have already paid. Move to **B** when you run several sites or routers. The application code is unchanged: set `NETWORK_ADAPTER=radius`.

### Credentials

One 8-character code from a 31-symbol alphabet with no ambiguous `0/O/1/I/L`, giving about 8.5×10¹¹ combinations. It serves as both the hotspot username and the password, so customers type a single thing. Codes are generated with `crypto.randomInt`. Copies are stored AES-256-GCM-encrypted, masked in the admin UI, and never logged. Voucher cards use separate 12-character codes, stored only as SHA-256 hashes.

### Why not RouterOS v7 REST

The router runs RouterOS v6, and v6 has no REST API. The adapter implements the binary API protocol, which works on v6 and v7 alike. An upgrade to v7 needs no code change.

### Time

All timestamps are UTC in the database. The browser formats them in the viewer's timezone, and the server uses `TZ=Africa/Douala`. The countdown runs off `serverTime` and `validUntil` returned by the server, so device clock errors don't matter, and it is never the enforcement mechanism.
