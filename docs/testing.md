# Testing

```bash
docker compose up -d postgres     # local PostgreSQL on 127.0.0.1:54329
npm test                          # unit + integration (Vitest)
npm run test:e2e                  # Playwright, mobile Chrome (Pixel 7 profile)
npm run lint && npm run typecheck && npm run build
```

* Integration tests migrate and use the dedicated `starling_test` database, and refuse non-local URLs.
* E2E tests start `next dev` on port 3100 against `starling_e2e` (migrated, emptied, seeded per run), with the payment simulator and fake router. They use the installed Google Chrome (`PW_CHANNEL=chromium` after `npx playwright install chromium` to use the bundled browser).
* Tests never touch Supabase or a real router.

## Results on the build machine (2026-10-23)

| Suite | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | 7 files, **93 tests passed** |
| `npm run test:e2e` | **14 passed** (mobile Chrome) |
| `npm run build` | success (all routes dynamic, manifest static) |
| `prisma migrate deploy` on Supabase | 2 migrations applied, `migrate status` up to date |

## What is covered

| Requirement | Test |
|---|---|
| Unpaid customer gets no access | `payment-lifecycle`: pending payment creates no subscription/credential; failed payment refused by `fulfilPayment`; e2e "a failed payment grants nothing" |
| Verified payment → exactly one subscription | concurrent `verifyPayment` ×3 → 1 subscription |
| Duplicate webhooks | two identical deliveries → one event, one subscription |
| Forged webhook | bad HMAC → 401, nothing granted |
| Webhook trusted only after provider re-check | webhook says complete, API says processing → nothing; then complete → granted |
| Amount mismatch | provider reports 100 for a 1350 package → not activated, flagged |
| Idempotent checkout | same key → same payment |
| Crash mid-fulfilment | SUCCEEDED payment without subscription repaired by reconciliation |
| Expiry automatic and idempotent | `expireDue` twice → 1; user removed from router; sessions kicked; login refused |
| Frontend countdown can't keep access | DB says expired while router session still open → session sync kicks it |
| Renewal (EXTEND / IMMEDIATE) | stacked on same code vs new code; no duplicated transactions |
| Router outage | provisioning fails → FAILED with backoff → succeeds when router returns; customer sees *Activating* |
| Dead-letter + recovery | job DEAD after max attempts; reconciliation re-queues and provisions |
| Router drift | missing user restored, stray managed user removed |
| Revocation | user removed + disconnected + audited |
| Warnings once per threshold | 15 then 5 minutes, deduplicated |
| Scheduler resilience | tick continues expiry while router is down |
| Vouchers exactly-once | concurrent double redemption → 1 subscription; reuse by another customer refused; codes not stored in plaintext |
| RouterOS protocol | length encoding round-trips, chunked parsing, durations, script-injection guard, router-local time conversion |
| RouterOS adapter (fake TCP router speaking the real protocol) | health, bad login, idempotent add/set, managed-only removal, scheduler, sessions, profile sync, read-only validation, unreachable router |
| Production guards | simulator, `ALLOW_SIMULATED_PAYMENTS`, fake router, http URL, missing router creds all refused in production |
| RBAC | role matrix, deny-by-default; e2e: anonymous → login/401, support → 403 on staff/packages |
| PWA | manifest fields, maskable icons, `sw.js` no-cache, API never cached, offline page |
| Counter sales | unique `name###` usernames + 6-digit passwords, router accepts only the right password, CASH payment recorded with staff id, double click = one sale; e2e slip |
| Router time-left | renewal adds used time (no early cut-off); `alignTimeLeft` only touches managed users; template preview renders `$(if)`/`$(var)` like the router |
| Customer accounts | register/validate/duplicate/legacy-number protection, login + lockout, no account enumeration, reset with own access code only, single-use expiring support codes, password change signs out other devices, safe post-login redirects |
| Customer UX (e2e) | sign-up → plan → pay → code → connect → online → countdown survives reload; sign-in; forgot password; captive-portal context stored, foreign login URL ignored |

## Needs real credentials or hardware (not executed)

* Notch Pay sandbox and live calls (code path tested with mocks; run one sandbox and one live 100 XAF payment).
* RouterOS API against the physical hAP lite (`npm run router:check`).
* FreeRADIUS ↔ MikroTik exchange (RADIUS mode only).
* Web Push delivery to a real phone with the app closed.
