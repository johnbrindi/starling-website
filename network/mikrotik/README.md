# MikroTik files

| Path | What | Risk |
|---|---|---|
| `hotspot/login.html` | Captive portal login: *Access code* and *Username & password* tabs, *Buy a pass online* button, static price list | Upload only |
| `hotspot/status.html` | Live *Time left* countdown, data used, renew, WhatsApp help (no logout, by design) | Upload only |
| `hotspot/alogin.html` | After-login page (goes to status) | Upload only |
| `scripts/01-base-network.rsc` | WAN, bridge, DHCP, DNS, NAT | **Disruptive**, fresh router only |
| `scripts/02-hotspot.rsc` | HotSpot server, user profiles, walled garden | **Disruptive** for customers |
| `scripts/03-api-user.rsc` | Least-privilege API user, API-SSL, service lockdown | Safe |
| `scripts/04-vpn-ovpn-client.rsc` | Management tunnel to the app server | Safe |
| `scripts/05-firewall.rsc` | Router protection | Can lock you out: use Safe Mode |
| `scripts/06-radius-optional.rsc` | Switch to RADIUS | Only for the RADIUS option |

Preview the pages locally (dev server running): `http://localhost:3000/api/dev/hotspot-preview?page=login` (also `status`, `alogin`; add `&error=invalid+password` to see an error).

The price list in `login.html` is static (the router cannot query the database). Update it when you change prices.

There is intentionally **no `logout.html`**: delete the router's default one so customers cannot log out and hand their login to another phone (staff can disconnect devices from the console).

Replace every `237600000000` (WhatsApp), `wifi.example.cm`, `vpn.example.cm` and `CHANGE-ME` before use.
Full procedure: [`docs/network-integration-guide.md`](../../docs/network-integration-guide.md).
