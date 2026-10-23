# Network integration guide

Step by step, from boxes to paying customers:

**Starlink → MikroTik hAP lite (WAN ether1) → HotSpot bridge → Tenda outdoor AP → customer phones**, with this application on a VPS.

Each step is marked **[SAFE]** (does not interrupt anyone) or **[DISRUPTIVE]** (changes routing or logins; do it during a maintenance window, with physical access to the router).

---

## 0. What you need

| Item | Notes |
|---|---|
| Starlink Standard kit | Dish + router, set up and online in the Starlink app |
| MikroTik hAP lite (RB941-2nD) | RouterOS 6.48.6 reported. Plan to upgrade to the latest **6.49.x long-term** |
| Tenda outdoor AP | Note the exact model from the label (the photo suggests the O-series CPE, e.g. O3/OS3). It must support **AP (bridge) mode** |
| Laptop with Winbox | https://mikrotik.com/download (Winbox 3.x works with v6) |
| Ethernet cables | Starlink → hAP ether1, hAP ether2 → Tenda PoE adapter LAN |
| VPS | Small Linux server with a public IPv4 (1 vCPU / 1–2 GB RAM is enough), plus a domain name, e.g. `wifi.example.cm` and `vpn.example.cm` |
| Notch Pay account | Business verified; test keys first, live keys at launch |

## 1. Lay out the addresses

| Network | Addresses |
|---|---|
| Starlink side (WAN) | DHCP from Starlink (`100.64.x.x` CGNAT in bypass mode, or `192.168.1.x` behind the Starlink router) |
| Customers | `10.5.50.0/24`, gateway/hotspot `10.5.50.1`, DHCP `.10–.250` |
| Management VPN | `10.99.0.0/24`: VPS `10.99.0.1`, router `10.99.0.2` |
| Tenda AP management | Give it a static `10.5.50.2` (outside the DHCP pool) |

## 2. Prepare the server and the app  **[SAFE]**

Follow [deployment.md](deployment.md) up to "Start the stack", using `PAYMENT_PROVIDER=notchpay` with **test** keys and `NETWORK_ADAPTER=routeros`. Check that:

* `https://wifi.example.cm/api/health` returns `{"ok":true}`;
* the OpenVPN server listens on TCP 1194 and you have the CA, router certificate and router key files.

> Before the router is connected you can still run the whole platform with `NETWORK_ADAPTER=fake` for a dry run. Production refuses `fake`, so use a staging environment (`NODE_ENV=development`) for the dry run.

## 3. Starlink  **[DISRUPTIVE for anything already using Starlink]**

1. In the Starlink app: *Settings → Advanced → Bypass mode* lets the MikroTik get the public-side address directly and avoids double NAT. Bypass disables the Starlink Wi-Fi and is reversible only by factory reset of the Starlink router. If you prefer to keep the Starlink router's Wi-Fi for staff use, leave bypass off. Double NAT works fine for this design, because the router dials out to the VPN.
2. Connect a Starlink LAN port (or the Starlink Ethernet adapter, depending on your kit) to **ether1** of the hAP lite.

## 4. MikroTik base configuration  **[DISRUPTIVE]**

1. Connect the laptop to **ether2**, open Winbox, and connect by MAC address.
2. Back up: `/system backup save name=factory` and `/export file=factory`. Download both.
3. Upgrade RouterOS within v6: *System → Packages → Check for updates*, channel **long-term**, *Download & Install*. Then *System → RouterBOARD → Upgrade* and reboot.
4. *System → Reset Configuration* → tick **No Default Configuration** → reset. Reconnect by MAC.
5. Set an admin password: `/user set admin password=<strong>` (better: create your own full-rights user and disable `admin`).
6. Open *New Terminal*, paste **`network/mikrotik/scripts/01-base-network.rsc`**.
7. Check: `/ip dhcp-client print` shows `bound` on ether1, and `/ping 1.1.1.1` works. A laptop on ether3 gets `10.5.50.x` and can browse (the HotSpot isn't on yet).

## 5. Tenda outdoor AP  **[DISRUPTIVE for the AP]**

The Tenda must act as a **transparent wireless bridge (AP mode)**. If it routes (router/WISP mode), all customers appear behind one MAC/IP and the HotSpot can't tell them apart.

1. Reset the Tenda and open its web UI (default address on the label, often `192.168.0.254` or `192.168.2.1`; set your laptop to a static IP in that subnet).
2. Operating mode: **AP** (sometimes called "Access Point" / "AP mode", *not* Router, WISP, or Client+AP).
3. LAN IP: static **`10.5.50.2/24`**, gateway `10.5.50.1`. **Disable its DHCP server.**
4. Wireless: SSID **`Starling Wi-Fi`**, security **None (open)**. The HotSpot code is the access control; an open SSID lets phones detect the captive portal. Enable **client/AP isolation** if offered, so customers can't see each other's devices.
5. Change the Tenda admin password. Plug its PoE injector's LAN port into **hAP ether2**.
6. Check: a phone joining `Starling Wi-Fi` gets a `10.5.50.x` address from the MikroTik (`/ip dhcp-server lease print`).

## 6. HotSpot pages and HotSpot  **[DISRUPTIVE for customers]**

1. Edit `network/mikrotik/hotspot/login.html`, `alogin.html` and `status.html`: replace `wifi.example.cm` with your `APP_URL` host, and update the price list in `login.html`. Preview them first at `http://localhost:3000/api/dev/hotspot-preview?page=login`.
2. Upload the four HTML files to a router folder named **`starling`** (Winbox → *Files*, drag and drop; create the folder by first running `/ip hotspot profile` setup or uploading as `starling/login.html`).
3. Edit `02-hotspot.rsc` (portal host), then paste it.
4. Check from a phone on the Wi-Fi: opening `http://neverssl.com` shows the blue Starling login page (Access code / Username & password tabs). *Buy a pass online* opens `https://wifi.example.cm/portal?...`. Android/iOS should also pop up the "Sign in to network" sheet automatically.

## 7. API user, VPN, firewall

1. **[SAFE]** Paste `03-api-user.rsc` after changing the password. Put the same credentials in the server's `ROUTER_USERNAME` / `ROUTER_PASSWORD`.
2. **[SAFE]** Upload `ca.crt`, `starling-router.crt`, `starling-router.key`, import them (see the script header), edit `vpn.example.cm` and the password, and paste `04-vpn-ovpn-client.rsc`. Check that `/interface ovpn-client print` shows `R` (running) and `/ping 10.99.0.1` works.
3. **[DISRUPTIVE: risk of lockout]** Turn on Safe Mode (Ctrl+X in the terminal), paste `05-firewall.rsc`, confirm Winbox still works, then leave Safe Mode.

## 8. Connect the platform to the router  **[SAFE]**

On the server:

```bash
# .env.production
NETWORK_ADAPTER=routeros
ROUTER_HOST=10.99.0.2
ROUTER_PORT=8729
ROUTER_TLS=true
ROUTER_TLS_INSECURE=true      # router uses a self-signed API-SSL cert (still encrypted)
ROUTER_HOTSPOT_SERVER=hotspot1
HOTSPOT_LOGIN_URL=http://10.5.50.1/login
```

```bash
docker compose -f deploy/docker-compose.prod.yml run --rm worker npm run router:check
```

All checks should be OK. Then in **Console → Network**: *Push profiles* (creates/updates `starling-default` and `starling-2dev`), then *Validate configuration*.

## 9. End-to-end test with real money (100 XAF)

1. Phone on `Starling Wi-Fi`. The portal opens; pick **1 Hour**, enter your MoMo number, choose MTN, and pay.
2. Approve the USSD prompt. The page shows *Payment confirmed*, then your code, and within seconds the badge turns **Active**. Console → Customers shows the code as `router: provisioned`. On the router, `/ip hotspot user print where comment~"starling"` lists it, and `/system scheduler print` shows `starling-exp-<CODE>`.
3. Tap **Connect this device**. The router logs you in and redirects to your access page, which shows **Online**. Browse.
4. Expiry test, with no money needed: in Console → Packages create an **inactive** 5-minute package, generate one voucher card for it (Console → Vouchers), redeem it on the phone (`/redeem`), and wait. Warnings appear at 5 and 1 minutes. At the end, the device is disconnected, the next page load shows the login page and then the portal with *Your Wi-Fi time has ended*.
5. Counter sale test: Console → **Sell a pass** → 1 Hour, a phone number and a name → print the slip. On a second phone, open any site, tap *Username & password*, and enter the slip's details. After login the **Time left** page appears.
6. Renewal test: buy again before expiry. The same code gets the extra time, with no disconnection.

## 10. Go live

* Switch to Notch Pay **live** keys and `NODE_ENV=production`. The app refuses to start if anything is still simulated.
* Run the [launch checklist](deployment.md#launch-checklist).

## Reachability summary

| From → To | Port | Purpose |
|---|---|---|
| Customer phone → router `10.5.50.1` | 80, 53, 67 | HotSpot login, DNS, DHCP |
| Customer phone → `wifi.example.cm` | 443 | Portal (walled garden before login) |
| Router → VPS `vpn.example.cm` | TCP 1194 (outbound) | Management tunnel |
| VPS worker → router `10.99.0.2` | TCP 8729 via tunnel | RouterOS API-SSL |
| Notch Pay → VPS | 443 | Webhooks |
| VPS → `api.notchpay.co` | 443 | Payment initiation and verification |
| VPS → Supabase pooler | 5432 | Database |

Nothing on the router is reachable from the internet. The database is reachable only by the app (Supabase network restrictions recommended).
