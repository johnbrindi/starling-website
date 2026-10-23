# Troubleshooting

## Portal and login

| Symptom | Likely cause | Fix |
|---|---|---|
| Customers browse without logging in | A FastTrack firewall rule (default config) bypasses the hotspot: `/ip firewall filter disable [find action=fasttrack-connection]`; or the port/AP is not in `bridge-hotspot` |
| Asked to log in again and again / "no more sessions" on the same phone | Private (random) MAC is on: Android → Use device MAC; iPhone → Private Wi-Fi Address off |
| RouterOS 7: hotspot inactive "not allowed by device-mode" | `/system/device-mode/update hotspot=yes`, then press the reset/mode button within 5 minutes |
| Ticket "wrong password" | Extra space or capital letters (the login page trims and lower-cases usernames; passwords are 6 digits) |
| Phone joins Wi-Fi but no login page | HotSpot off, or the device is using cached DNS/HTTPS | Open `http://neverssl.com`; check `/ip hotspot print` (enabled, interface `bridge-hotspot`); don't whitelist captive-check domains |
| Login page shows but the portal doesn't load | Portal host missing from the walled garden, or its IP changed | `/ip hotspot walled-garden ip print`; add/refresh `dst-host=<APP_URL host>`; Console → Network → Validate |
| Portal loads without styling | Assets come from the same host, so this is a partial walled-garden match | Make sure the exact host (not just a subdomain) is in the walled garden |
| "Connect" shows *invalid username or password* | Code not yet on the router, or `http-pap` not enabled | Customer page should say **Active** (not Activating); `/ip hotspot profile print` → `login-by` includes `http-pap`; Console → customer → *Re-sync router* |
| *no more sessions are allowed for user* | Device limit reached | Log out the other device (`http://10.5.50.1/logout`) or buy a 2-device pass |
| All customers share one MAC in `/ip hotspot host` | Tenda is routing (router/WISP mode) | Put the Tenda in **AP mode**, DHCP off |
| Phone gets `192.168.x.x` instead of `10.5.50.x` | Tenda DHCP server still on | Disable Tenda DHCP |

## DHCP / DNS

* `/ip dhcp-server lease print` shows which devices got addresses. If the pool is exhausted, lower `lease-time` or widen the pool.
* `/ip dns print`: `allow-remote-requests=yes`. Test from a client with `nslookup wifi.example.cm 10.5.50.1`.
* WAN down: `/ip dhcp-client print` on ether1 should be `bound`; power-cycle the Starlink router.

## Payments

| Symptom | Check |
|---|---|
| "We could not start the payment" | Notch Pay keys/mode (test vs live), server can reach `api.notchpay.co`; log entries `Payment initiation failed` |
| No USSD prompt | Number/operator mismatch (ported numbers: switch MTN/Orange); operator delays; dial `*126#` (MTN) or `#150*50#` (Orange) to see pending approvals |
| Stuck on "Waiting for confirmation" | Webhook not reaching the server is fine (polling and reconciliation cover it); check Console → Payments → *Re-check*, and `WebhookEvent.error` |
| Webhook `Invalid signature` | Wrong `NOTCHPAY_WEBHOOK_HASH` (hash key vs per-webhook secret); see payments.md |
| Paid but shows "Payment not completed" | Payment expired locally before approval. Reconciliation re-checks for 24 h and grants access if Notch Pay confirms. Re-check from the console |
| "Confirmation did not match" | Provider reported a different amount/currency/reference. Investigate before doing anything; no access was granted |

## Provisioning / router

| Symptom | Check |
|---|---|
| Codes stay **Activating** | Console → Network: router unreachable? VPN (`/interface ovpn-client print`), API-SSL service, `ROUTER_*` vars; Sync errors list |
| `Router connection failed: ... ECONNREFUSED` | API-SSL disabled or `address=` doesn't include `10.99.0.1` |
| `invalid user name or password` | `ROUTER_USERNAME`/`ROUTER_PASSWORD`; user `address=` restriction |
| `not enough permissions` on scheduler | API group lacks `write`; or turn off the router-side expiry backstop in Settings |
| TLS error to router | `ROUTER_TLS_INSECURE=true` for the self-signed router certificate, or install a CA-signed cert |

## Expiry

| Symptom | Check |
|---|---|
| Customer still online after expiry | Is the worker running? (`docker compose ps`, logs `Worker started`). Session sync interval (Settings). Router clock/NTP for the scheduler backstop |
| Expired early | Router clock wrong (scheduler fires early): `/system clock print`, enable NTP |
| No expiry warnings | In-app warnings need the page open; push needs reminders enabled, VAPID keys, and the PWA/browser allowed to notify; iOS needs the app installed to the home screen (iOS 16.4+) |
| Countdown differs from the router's `session-time-left` | The portal countdown is the truth (end time from the database); `limit-uptime` is only a backstop and counts connected time only |

## Database

* `P1001 Can't reach database server` at `db.<ref>.supabase.co`: that host is IPv6-only; use the session pooler URL.
* `self-signed certificate in certificate chain`: add `&uselibpqcompat=true`, or set `DATABASE_CA_CERT` to Supabase's CA.
* `Max client connections reached`: lower `DATABASE_POOL_MAX`, or use a larger Supabase plan.
