# MikroTik files

| Path | What | Risk |
|---|---|---|
| `hotspot/login.html` | Login page: forwards devices to the portal, manual code fallback | Upload only |
| `hotspot/alogin.html`, `status.html`, `logout.html` | After-login, status and logout pages | Upload only |
| `scripts/01-base-network.rsc` | WAN, bridge, DHCP, DNS, NAT | **Disruptive**, fresh router only |
| `scripts/02-hotspot.rsc` | HotSpot server, user profiles, walled garden | **Disruptive** for customers |
| `scripts/03-api-user.rsc` | Least-privilege API user, API-SSL, service lockdown | Safe |
| `scripts/04-vpn-ovpn-client.rsc` | Management tunnel to the app server | Safe |
| `scripts/05-firewall.rsc` | Router protection | Can lock you out: use Safe Mode |
| `scripts/06-radius-optional.rsc` | Switch to RADIUS | Only for the RADIUS option |

Replace every `wifi.example.cm`, `vpn.example.cm` and `CHANGE-ME` before use.
Full procedure: [`docs/network-integration-guide.md`](../../docs/network-integration-guide.md).
