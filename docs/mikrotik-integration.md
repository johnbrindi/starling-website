# MikroTik integration

## Method

The platform controls the router through the **RouterOS API** (binary protocol, `src/server/network/routeros/`), not REST. REST exists only in RouterOS v7, and this hAP lite runs **v6.48.6**. The API has been in RouterOS for many years, and the plain-text login it uses needs **6.43+**. The same code works on v7, so upgrading needs no app change.

| Item | Value |
|---|---|
| Transport | API-SSL, TCP **8729** (TLS). Plain API 8728 only inside the VPN, if ever |
| Reachability | Only over the management VPN (`10.99.0.0/24`). The router is behind Starlink CGNAT and is never exposed publicly |
| Account | `starling-api`, group policies `api,read,write,test` only, `address=10.99.0.0/24` |
| Connections | Short-lived (connect, command, close) to save memory on the 32 MB hAP lite |
| Router objects touched | `/ip hotspot user` (only entries whose comment starts with `starling:`), `/ip hotspot active` (remove = disconnect), `/ip hotspot user profile` (profile sync), `/system scheduler` (entries named `starling-exp-*`) |
| Read-only checks | `/system resource`, `/system clock`, `/system ntp client`, `/ip hotspot`, `/ip hotspot walled-garden(ip)`, `/ip service` |

The platform **never** resets the router, changes interfaces, addresses, firewall or NAT, or runs free-form commands. There is no command box in the console. Configuration changes are applied by a person, using the scripts in `network/mikrotik/scripts/`.

## What each operation does

| Operation | RouterOS commands |
|---|---|
| Provision (idempotent) | `print ?name=CODE` → `add` or `set` with `name, password, server, profile, limit-uptime, limit-bytes-total, comment=starling:<id>, disabled=no` → `print` again to confirm → optional scheduler upsert |
| Router-side expiry backstop | `/system scheduler add name=starling-exp-CODE start-date=… start-time=… (router local time from /system clock gmt-offset) on-event="/ip hotspot active remove [find user=CODE]; /ip hotspot user remove [find name=CODE]; /system scheduler remove [find name=starling-exp-CODE]"` |
| Deprovision | kick active sessions → remove user (managed only) → remove scheduler |
| Session sync | `/ip hotspot active print` (user, address, mac-address, uptime, bytes) |
| Reconcile | `/ip hotspot user print`, filtered to `starling:` comments, compared with the database |
| Profile sync | `/ip hotspot user profile add/set rate-limit, shared-users, idle-timeout` |

Usernames are restricted to `[A-Za-z0-9_-]` before use in any router script (`scriptSafe`), so nothing can be injected through a code.

## Two kinds of logins

| Style | Username / password | Created by | Typed on the login page |
|---|---|---|---|
| Access code | `K7M4QX2P` / same code | Online purchase, voucher card | *Access code* tab (one field) |
| Username + password | `awa482` / `568230` (6 digits) | Staff, Console → **Sell a pass** (cash, cyber-café style) | *Username & password* tab |

Both are ordinary hotspot users with the same profile, limits and expiry handling. Usernames are unique (DB constraint). In RADIUS mode, counter sales always use access codes, because the RADIUS view uses the username as the password.

## Time left shown by the router

`status.html` displays `$(session-time-left)`, which RouterOS computes as `limit-uptime` minus time already used. The platform sets `limit-uptime = time already used + time remaining until the real expiry`, both when provisioning and on every session sync (`alignTimeLeft`). The router's own countdown therefore matches the expiry in the database to within one sync interval (60 s by default). This also fixes renewals: adding time to an existing user never shortens it.

## Defence in depth on expiry

1. The worker expires the credential in the DB on time and removes the user and its sessions (every 10 s check).
2. The session sync kicks any active session whose credential isn't entitled (every 60 s, configurable).
3. The **router scheduler** removes the user at the exact end time, even if the server or VPN is down. This needs the router clock to be right (NTP enabled), and it can be turned off in Settings.
4. `limit-uptime` (time used + remaining, kept aligned) makes the router itself end a connected session at the expiry time.

## Prerequisites on the router

* RouterOS **6.49.x long-term** recommended (6.48.6 works; upgrading inside v6 adds security fixes). Back up first: `/system backup save` and `/export file=before-starling`.
* HotSpot server `hotspot1` on the customer bridge, with profile `login-by` including **`http-pap`** (the portal's *Connect* button sends the code as username/password).
* HTML directory `starling` holding `network/mikrotik/hotspot/*.html`, with `PORTAL_URL` and the links edited to your `APP_URL`.
* Walled garden **ip** entry for the portal host.
* NTP client enabled, time zone `Africa/Douala`.
* API user, API-SSL certificate, and service restrictions (`03-api-user.rsc`).
* VPN client to the server (`04-vpn-ovpn-client.rsc`).

## Verifying from the server

```bash
npm run router:check
```

This prints the connection result, RouterOS version and board, and these checks: HotSpot server present and enabled, expected user profiles, walled garden contains the portal, NTP, and API service restrictions. It changes nothing. The same checks run from **Console → Network → Validate configuration**.

## hAP lite limits (RB941-2nD)

* 650 MHz single-core MIPS CPU, 32 MB RAM, 16 MB flash, **four 100 Mbit/s** Ethernet ports, 2.4 GHz-only radio.
* Starlink can deliver more than 100 Mbit/s, but the hAP lite caps the whole site at under 100 Mbit/s of wire speed. With NAT, HotSpot, and per-user rate limits (dynamic simple queues), expect a practical ceiling well below that (roughly 40–80 Mbit/s aggregate). **Measure it** with `/tool bandwidth-test` and `/system resource monitor` under load.
* Concurrent users: plan for **about 20–40 active customers** on this unit. Upgrade when CPU stays above ~70 % at peak, or when you need more than 50 users or gigabit ports. Candidates: **hEX (RB750Gr3)** or **hAP ax lite / hAP ax²** (RouterOS v7; the API adapter keeps working).
* Keep the `starling` HTML pages small (they are about 4 KB) because flash is tight.
