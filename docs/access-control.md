# Access control

Access control works in five separate layers. A failure in one doesn't open the others.

## 1. Network access policy (MikroTik)

| Who | Can reach | Enforced by |
|---|---|---|
| Unauthenticated device | DHCP, DNS, the HotSpot login page on the router, and the portal host (walled garden). Nothing else | HotSpot + walled garden (`02-hotspot.rsc`) |
| Payment pending/failed | Same as unauthenticated. A pending payment grants nothing | No router user exists until verified payment and provisioning |
| Paid, entitled | Internet at the package's speed (`rate-limit`), device count (`shared-users`), data cap (`limit-bytes-total`) | Hotspot user + profile |
| Expired / revoked | Back to unauthenticated: user removed, sessions kicked, next request lands on the portal with a renew prompt | Worker deprovisioning, session-sync enforcement, router scheduler backstop |
| Customer → other customers | Blocked at the AP (client isolation) | Tenda isolation setting |
| Customer → router services / management / VPN | Blocked | `05-firewall.rsc` input/forward drops |
| Anyone on the internet → router | Blocked; the router sits behind CGNAT and drops WAN input | Starlink CGNAT + firewall |
| Application server → router API | API-SSL 8729, **only via the VPN**, only the `starling-api` user (policies `api,read,write,test`), `address=10.99.0.0/24` | `/ip service`, `/user`, firewall |

### Walled garden and its limits

* Only the portal host is allowed before login. The walled-garden **ip** list with `dst-host` matches the resolved IP addresses, so it also works for HTTPS. RouterOS refreshes the resolution periodically. If the app sits behind a CDN with changing IPs, add each host, or host the portal on a stable IP.
* HTTPS sites can't be redirected to the login page (the router can't forge certificates). Phones detect the portal through their plain-HTTP captive-portal checks instead. **Do not** whitelist `connectivitycheck.gstatic.com`, `captive.apple.com`, or `www.msftconnecttest.com`, or that detection breaks.
* Mobile apps (WhatsApp and others) simply have no connection until login. That is expected.
* Payment providers: Notch Pay direct charge is server-to-server, and the customer approves on their phone's USSD menu, which runs over the cellular network, not Wi-Fi. **No payment domain is needed in the walled garden.** Only a hosted checkout page would need its domain added.
* DNS is forced to the router (`05-firewall.rsc`), so customers can't use another resolver to get around the walled garden.

## 2. Application roles (server-side RBAC)

Deny by default (`src/server/auth/rbac.ts`). Every admin page calls `requireStaffPage(permission)` and every admin API calls `staffRoute(permission)`. The UI hiding links is cosmetic only.

| Permission | Viewer | Support | Admin | Super admin |
|---|:-:|:-:|:-:|:-:|
| dashboard:view, customers:view, payments:view, network:view | ✓ | ✓ | ✓ | ✓ |
| customers:revoke (revoke/block/disconnect), audit:view | | ✓ | ✓ | ✓ |
| packages:manage, payments:reconcile, network:manage, settings:manage | | | ✓ | ✓ |
| staff:manage | | | | ✓ |

Escalation protection: only super admins change roles; nobody can change their own role or deactivate themselves; the last active super admin can't be demoted or disabled; role changes and password resets end the target's sessions.

Nobody, at any role, can mark a payment as paid, or send arbitrary commands to the router.

## 3. Customer access

* Customers have no passwords. A session is created after checkout or voucher redemption, or by recovery with **phone + any of their access codes** (rate-limited per IP and per phone, generic error messages).
* A customer can only read their own payments, access and notifications. Every query is scoped by `customerId` from the session.

## 4. API protections

| Control | Where |
|---|---|
| Sessions: random 256-bit token in an `HttpOnly`, `Secure`, `__Host-` cookie; only the SHA-256 is stored; staff 12 h absolute / 2 h idle; customers 30 days | `auth/session.ts` |
| CSRF: `Origin`/`Referer` must equal `APP_URL` on every cookie-authenticated mutation; staff mutations also need the per-session `x-csrf-token`; staff cookie is `SameSite=Strict` | `http.ts`, `admin/route.ts` |
| Rate limits (Postgres, multi-instance safe): checkout, recovery, voucher, staff login (IP + account), password reset, webhooks | `rate-limit.ts` |
| Account lockout: 5 failed logins → 15 min | `auth/staff.ts` |
| Validation: Zod on every body; consistent `{error:{code,message,details}}`; no stack traces to clients | `http.ts` |
| Webhooks: HMAC signature, raw-body verification, stored once, then re-verified with the provider | `payments/service.ts` |
| Cron endpoint: constant-time bearer check | `api/cron/tick` |
| Dev-only endpoints (`/api/dev/*`) return 404 unless simulation is enabled outside production | |
| Headers: strict CSP (no third-party sources), `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy | `next.config.ts` |

## 5. Data and secrets

* Database: reachable only from the app server. On Supabase, enable *Network Restrictions* to the VPS IP, and don't use the Supabase anon key or Data API for this app. Optional RADIUS role: SELECT on views, INSERT/UPDATE on accounting only.
* Secrets live only in server environment variables: router password, Notch Pay keys, VAPID private key, `ENCRYPTION_KEY`. Router credentials are never stored in the database or sent to browsers, and they can't be edited from the console.
* Access codes are encrypted at rest (AES-256-GCM) and masked in the admin UI. Voucher codes are hashed. Logs pass through a redactor for any key that looks like a secret.

## What belongs where

| Rule | Router | Application |
|---|:-:|:-:|
| Walled garden, login page redirect, DNS forcing | ✓ | |
| Per-user speed, device count, data cap, session removal | ✓ (executes) | ✓ (decides and pushes) |
| Who is entitled and until when | | ✓ (source of truth) |
| Router protection, management ACL, client isolation (AP) | ✓ | |
| Payment verification, roles, CSRF, rate limits, audit | | ✓ |

## Compliance items to confirm

These are **not** certified or verified by this project. Confirm them with qualified advisers before commercial launch:

* **Telecom licensing**: whether reselling internet access to the public needs an authorisation or declaration with Cameroon's telecom regulator (ART / MINPOSTEL), and whether Starlink's terms of service allow resale on your plan.
* **Personal data**: Cameroon's personal data protection law (2024) and its implementing rules: lawful basis, registration with the authority if required, retention periods, breach notification. Adapt `privacy` and `terms` (they are templates).
* **Lawful interception / log retention**: whether you must keep connection logs (who had which IP and when). `NetworkSession` records MAC/IP/time, so set the retention to what the law requires.
* **Consumer protection and invoicing/tax**: receipts, VAT treatment of the passes, refund policy.
* **Payment provider KYC**: business registration documents for Notch Pay live keys and settlement.
