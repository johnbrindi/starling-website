# Starling Wi-Fi: complete system setup guide

From boxes to paying customers: **Starlink → MikroTik hAP lite → Tenda outdoor AP → customer phones**, connected to the Starling platform (website, payments, admin console).

Follow the parts in order. Each step shows what to click in **Winbox** and the same thing as a **terminal command** (Winbox → *New Terminal*), so you can use whichever you prefer. Steps marked ⚠️ interrupt the network; do them before customers are using it.

| Part | What you do | Time |
|---|---|---|
| 0 | Check what you have, plan addresses | 10 min |
| 1 | Set up Starlink | 20 min |
| 2 | First access to the MikroTik (Winbox, reset, password, update) | 20 min |
| 3 | Base network (internet in, customer bridge out) | 15 min |
| 4 | HotSpot captive portal | 20 min |
| 5 | Upload the Starling login pages | 15 min |
| 6 | HotSpot settings and user profiles (speed, devices, anti-sharing) | 10 min |
| 7 | Tenda outdoor access point | 30 min |
| 8 | Connect the router to the Starling platform (API user, VPN, firewall) | 45 min |
| 9 | Test everything | 30 min |
| 10 | Daily operation: selling, tickets, support | — |
| 11 | Troubleshooting | — |

---

## Part 0. Before you start

### What you need

| Item | Notes |
|---|---|
| Starlink Standard kit | Dish, Starlink router, cables. Account active in the Starlink app |
| MikroTik **hAP lite** (RB941-2nD) | Reported RouterOS 6.48.6. Upgrade to the latest 6.49.x long-term in Part 2 |
| **Tenda outdoor AP** | Note the exact model on its label (e.g. O3, OS3, O1). You need its PoE injector and power adapter |
| Laptop with **Winbox** | Download from https://mikrotik.com/download (Winbox 3 for RouterOS 6). If your laptop has no Ethernet port, use a USB/USB-C Ethernet adapter |
| 3 Ethernet cables | Starlink → MikroTik, MikroTik → Tenda injector, laptop → MikroTik |
| Phone with Wi-Fi | For testing |
| Server (VPS) + domain | For the website and console, e.g. `wifi.example.cm`. See [deployment.md](deployment.md) |

### How it fits together

```
 Starlink dish ── Starlink router ──(Ethernet)── ether1  MikroTik hAP lite  ether2 ──(Ethernet)── Tenda PoE injector ── Tenda AP ))) customers
                                                  WAN      10.5.50.1           LAN                   (PoE port)            open SSID "Starling Wi-Fi"
                                                           HotSpot + DHCP + DNS
                                                           VPN tunnel ─────────────────────► Starling server (website, console, payments)
```

* **ether1** = internet in (Starlink). Never put it in the customer bridge.
* **ether2, ether3, ether4** (+ the hAP lite's own Wi-Fi if you want) = customer side. Everything plugged here must log in through the captive portal.
* The hAP lite has **no PoE output**, so the Tenda is powered by its own PoE injector. (Bigger MikroTiks like the hAP ax3 power an AP from port 5.)

### Write down your values

| Setting | Value used in this guide | Yours |
|---|---|---|
| Wi-Fi name (SSID) | `Starling Wi-Fi` | |
| Customer network | `10.5.50.0/24`, router `10.5.50.1` | |
| Tenda management IP | `10.5.50.2` | |
| HotSpot DNS name (shows in the address bar) | `login.starling` | |
| Website (APP_URL) | `https://wifi.example.cm` | |
| WhatsApp support number | `237600000000` | |
| MikroTik admin password | (strong, keep it safe) | |

---

## Part 1. Starlink

1. Install the dish with a clear view of the sky (use the Starlink app's *Check for obstructions*). Mount it securely; wind is the biggest risk outdoors.
2. Power the Starlink router and finish setup in the app until the app shows **Online**.
3. Connect a Starlink router **Ethernet (LAN) port** to the MikroTik **ether1**. Kits without an Ethernet port need the *Starlink Ethernet Adapter* between the Starlink router and its cable.
4. Optional, **Bypass mode** (Starlink app → Settings → Advanced → Bypass Starlink Wi-Fi router): the MikroTik then talks to Starlink directly, which avoids "double NAT". Bypass turns off the Starlink Wi-Fi, and **only a factory reset of the Starlink router undoes it**. If you want to keep Starlink Wi-Fi for yourself, skip bypass; everything in this guide still works.

> Starlink uses CGNAT: nobody on the internet can connect *in* to your router. That is fine. The router connects *out* to your server through a VPN (Part 8).

---

## Part 2. First access to the MikroTik

### 2.1 Connect with Winbox

1. Power the hAP lite (blue/green LEDs).
2. Connect the laptop to **ether2** (not ether1: the default setup blocks management from ether1).
3. Open Winbox → tab **Neighbors** → **Refresh**. The router appears with its MAC address. If it does not, try another port and refresh again.
4. Click the **MAC address** (works even when IP settings are wrong) → Login `admin`, Password: empty → **Connect**.
   * If "wrong username or password": newer MikroTiks have a unique password printed on the sticker underneath or on a card in the box. Try that. Try both the MAC and the IP address in the *Connect To* box.
   * Still refused? Someone configured it before: do the hardware reset below.

### 2.2 Hardware reset (only if you cannot log in)

1. Unplug the power.
2. Press and **hold the reset button** (small hole next to the power jack).
3. While holding, plug the power back in. Keep holding until the **USR/ACT LED starts flashing** (about 5 seconds), then release.
4. Wait about 1 minute, then Winbox → Neighbors → Refresh → connect with `admin` and empty password (or the sticker password).

### 2.3 Start clean ⚠️

When Winbox shows the *default configuration* message, we will remove it so nothing (like FastTrack) interferes with the hotspot:

* Winbox: **System → Reset Configuration** → tick **No Default Configuration** → **Reset Configuration**. The router reboots; reconnect by **MAC address** (it now has no IP).
* Terminal: `/system reset-configuration no-defaults=yes skip-backup=no`

### 2.4 Password, name, clock

* Winbox: **System → Password** (set a strong password). **System → Identity** = `starling-hotspot`. **System → Clock** → Time Zone `Africa/Douala`. **System → SNTP Client** (v6; *NTP Client* on v7) → Enabled, servers `162.159.200.1` and `162.159.200.123`.
* Terminal:

```
/user set admin password="YOUR-STRONG-PASSWORD"
/system identity set name=starling-hotspot
/system clock set time-zone-name=Africa/Douala
/system ntp client set enabled=yes primary-ntp=162.159.200.1 secondary-ntp=162.159.200.123
```

> The command above is RouterOS 6 (built-in SNTP client). On RouterOS 7 use `/system ntp client set enabled=yes servers=162.159.200.1,162.159.200.123`. The clock synchronises once the internet is connected (Part 3.1).

### 2.5 Update RouterOS (needs internet: do Part 3.1 first, then come back)

Always update **before** configuring, so an update does not change your settings later.

* Winbox: **System → Packages → Check For Updates** → Channel **long-term** → **Download&Install**. The router reboots. Then **System → RouterBOARD → Upgrade** → reboot again (**System → Reboot**).
* Terminal: `/system package update set channel=long-term` · `/system package update install` · after reboot `/system routerboard upgrade` · `/system reboot`

Stay on RouterOS **6.49.x long-term**. The hAP lite has only 16 MB storage, and the platform works with v6.

---

## Part 3. Base network

### 3.1 Internet in (ether1)

* Winbox: **IP → DHCP Client → +** → Interface `ether1`, Use Peer DNS **off**, Add Default Route **yes** → OK. Status must become **bound**. **IP → DNS** → Servers `1.1.1.1`, `8.8.8.8`, tick **Allow Remote Requests**.
* Terminal:

```
/ip dhcp-client add interface=ether1 disabled=no use-peer-dns=no add-default-route=yes comment="WAN Starlink"
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes
/ping 1.1.1.1 count=3
```

Now go back and do the update (2.5).

### 3.2 Customer bridge (ether2–4 + Wi-Fi)

Everything in this bridge must go through the captive portal. **ether1 must not be in it.**

* Winbox: **Bridge → +** → Name `bridge-hotspot` → OK. **Bridge → Ports → +** → add `ether2`, `ether3`, `ether4` (and `wlan1` if you will also use the hAP lite's own Wi-Fi). **IP → Addresses → +** → `10.5.50.1/24`, Interface `bridge-hotspot`.
* Terminal:

```
/interface bridge add name=bridge-hotspot protocol-mode=none
/interface bridge port add bridge=bridge-hotspot interface=ether2
/interface bridge port add bridge=bridge-hotspot interface=ether3
/interface bridge port add bridge=bridge-hotspot interface=ether4
/ip address add address=10.5.50.1/24 interface=bridge-hotspot
```

Optional, hAP lite Wi-Fi as a second customer access point (indoor, 2.4 GHz): **Wireless → wlan1** → Mode `ap bridge`, SSID `Starling Wi-Fi`, Security Profile with **no password** (default profile, mode none) → Enable. Then add `wlan1` to the bridge ports.

> Keep a way back in: leave the laptop on ether2 for now. Once the HotSpot is on, the laptop must log in too. Winbox via MAC address keeps working, but browsing does not.

---

## Part 4. HotSpot captive portal ⚠️

### 4.1 The HotSpot Setup wizard (same as the video)

Winbox: **IP → Hotspot → Hotspot Setup** and answer:

| Wizard question | Answer |
|---|---|
| HotSpot Interface | `bridge-hotspot` |
| Local Address of Network | `10.5.50.1/24`, **Masquerade Network** ticked |
| Address Pool of Network | `10.5.50.10-10.5.50.250` |
| Select Certificate | `none` |
| IP Address of SMTP Server | `0.0.0.0` |
| DNS Servers | `1.1.1.1`, `8.8.8.8` |
| DNS Name | `login.starling` (your business name; shown in the address bar) |
| Name of Local HotSpot User | `admin` + a password (for your own testing only) |

The wizard creates the HotSpot server `hotspot1`, a server profile (`hsprof1`), the DHCP server, the address pool and the NAT rule.

Terminal alternative: run `network/mikrotik/scripts/01-base-network.rsc` and `02-hotspot.rsc` from this repository on a router with *no default configuration*, instead of 3.1–3.2 and the wizard. They produce the same result with all of Part 6's settings included.

### 4.2 FastTrack must be OFF

If you kept MikroTik's default configuration, it contains a **FastTrack** firewall rule, and traffic that is fast-tracked skips the hotspot (customers get internet without logging in). With "No Default Configuration" there is none, but check anyway:

* Winbox: **IP → Firewall → Filter Rules** → any rule with action **fasttrack connection** → select → **Disable** (red X).
* Terminal: `/ip firewall filter disable [find action=fasttrack-connection]`

### 4.3 RouterOS 7 only: device-mode

Newer RouterOS 7 releases ship with the hotspot disabled by "device-mode". `/ip hotspot print` then says *not allowed by device-mode*. Enable it:

```
/system/device-mode/update hotspot=yes
```

Then, within 5 minutes, **press the reset/mode button once** (or unplug and replug the power) to confirm. The hAP lite on RouterOS 6 does not have device-mode; skip this.

### 4.4 Quick test

Phone → Wi-Fi → join the network (via the Tenda once Part 7 is done, or the hAP lite's own Wi-Fi). Open `http://neverssl.com`. MikroTik's grey default login page should appear. Next we replace it.

---

## Part 5. Upload the Starling login pages

The files are in this repository: `network/mikrotik/hotspot/` → `login.html`, `alogin.html`, `status.html`.

### 5.1 Edit them first (any text editor)

| Find | Replace with |
|---|---|
| `wifi.example.cm` | your website host, e.g. `wifi.starlingcm.com` |
| `237600000000` | your WhatsApp number (country code + number, digits only) |
| Price list in `login.html` | your current prices |

Preview them on your laptop before uploading: start the app (`npm run dev`) and open `http://localhost:3000/api/dev/hotspot-preview?page=login` (also `page=status`).

### 5.2 Upload

1. Winbox: **Files**. Open the folder **`hotspot`** (created by the wizard).
2. Rename the original `hotspot/login.html` to `login-backup.html` (right-click → rename) so you can switch back if needed.
3. **Drag** your `login.html`, `alogin.html`, `status.html` from your computer into the **`hotspot`** folder in the Files window. The names must be exactly these, in exactly that folder.
4. **Delete `hotspot/logout.html`**. Without it customers cannot log out and hand their login to another phone (staff can still disconnect a device from the console).
5. The Files list sometimes does not refresh: close and reopen *Files* and check that the files sit **inside** `hotspot/`, not at the top level.

> If you used the scripts in 4.1, the server profile uses the folder **`starling`** instead of `hotspot`: upload into `starling/` (create it by dragging a file named `starling/login.html`, or upload to `hotspot/` and set the folder in 6.1).

### 5.3 Test

Phone → open `http://neverssl.com` → the **blue Starling page** appears with *Access code* and *Username & password* tabs, prices, *Buy a pass online* and WhatsApp.

---

## Part 6. HotSpot settings and user profiles

### 6.1 Server and server profile

* **IP → Hotspot → Servers → hotspot1** → **Addresses Per MAC = 1** (one IP per phone).
* **IP → Hotspot → Server Profiles → hsprof1** (or `hsprof-starling`):
  * General: DNS Name `login.starling`, HTML Directory `hotspot` (or `starling`), SMTP `0.0.0.0`.
  * **Login → Login By**: tick **HTTP CHAP**, **HTTP PAP**, **MAC Cookie**, **Cookie**. HTTP PAP is required by the Starling login page and the website's *Connect* button. MAC Cookie logs a returning phone back in automatically (its lifetime, `mac-cookie-timeout`, is a *user profile* setting on RouterOS 6).
* Terminal:

```
/ip hotspot set hotspot1 addresses-per-mac=1
/ip hotspot profile set [find name~"hsprof"] login-by=http-chap,http-pap,mac-cookie,cookie dns-name=login.starling
```

### 6.2 User profiles (speed, devices, anti-sharing)

You can create these in Winbox (**IP → Hotspot → User Profiles**), but it is easier in the **Starling console → Network → User profiles**, then **Push profiles**. The platform creates and updates them on the router.

| Field | Recommended | Why |
|---|---|---|
| Rate limit (upload/download) | e.g. `2M/4M`, `5M/10M` | Heavy downloaders do not slow everyone else |
| Shared users | `1` (or 2 for family passes) | Devices that can use one login at the same time |
| Idle timeout | `none` | Do not log out a customer just for being idle |
| **Keepalive timeout** | **`3h`** | If a phone switches Wi-Fi off, it keeps its slot for 3 hours, so the login cannot be moved to a friend's phone in the meantime |
| Status autorefresh | `1m` | The *Time left* page refreshes every minute |
| Add MAC cookie | yes | Automatic re-login of the same phone |

Each package in the console (1 hour, 24 hours, 1 week…) points to one of these profiles.

### 6.3 Users

You do **not** create hotspot users by hand. The platform creates them:

* online purchases and voucher cards → an access code;
* **Sell a pass** at the counter → username + password for one customer;
* **Printed tickets** → a batch of username + password tickets whose time starts at first login.

Each user carries the comment `starling:…`; the platform never touches users you create yourself. The platform also removes users when their time ends and keeps the router's *time left* exact.

---

## Part 7. Tenda outdoor access point ⚠️

The Tenda must be a **transparent access point** (bridge). If it acts as a router (Router/WISP mode, its own DHCP), every customer looks like one device to the MikroTik and the system cannot tell them apart.

### 7.1 Wiring

```
MikroTik ether2 ──► injector "LAN"     injector "PoE" ──► Tenda (long outdoor cable)     injector power ──► socket
```

Use outdoor-rated cable, a drip loop before the connector, and close the Tenda's cable cover. Mount it high (3–6 m), facing the area where customers sit, with the antennas vertical.

### 7.2 Configure it (laptop directly on the injector's LAN port)

1. Reset the Tenda (hold its reset for about 8 s with power on).
2. Set the laptop to a fixed IP in the Tenda's default range (on the label, often `192.168.2.1` or `192.168.0.254`), e.g. laptop `192.168.2.100/24`. Open the label's address in a browser and log in.
3. **Working mode / Operating mode: AP** (sometimes "Access Point"; *not* Router, WISP, Client+AP or P2P).
4. **LAN settings**: static IP `10.5.50.2`, mask `255.255.255.0`, gateway `10.5.50.1`, DNS `10.5.50.1`. **DHCP server: OFF.**
5. **Wireless**: SSID `Starling Wi-Fi`, Security **None / Open**. The captive portal is the lock, and an open network lets phones detect the login page automatically. Country: Cameroon. Channel: try 1, 6 or 11 and keep the least crowded; on 2.4 GHz use 20 MHz width for range.
6. **Client isolation / AP isolation: ON** (customers cannot see each other's phones), if your model has it.
7. Change the Tenda **admin password**. Save and reboot.
8. Move the laptop's network setting back to automatic (DHCP). Plug the injector LAN into **MikroTik ether2**.

### 7.3 Check

* Phone joins `Starling Wi-Fi` → gets a `10.5.50.x` address (phone Wi-Fi details).
* MikroTik: **IP → DHCP Server → Leases** shows the phone's own MAC (not the Tenda's).
* The blue Starling login page appears on `http://neverssl.com`.
* You can reach the Tenda's settings at `http://10.5.50.2` from a logged-in device.

---

## Part 8. Connect the router to the Starling platform

Do this once your server is running ([deployment.md](deployment.md)): website on `https://wifi.example.cm`, OpenVPN server on `vpn.example.cm`.

### 8.1 Let customers reach the website before login (walled garden)

* Winbox: **IP → Hotspot → Walled Garden IP List → +** → Action **accept**, Dst. Host `wifi.example.cm`.
* Terminal: `/ip hotspot walled-garden ip add action=accept dst-host=wifi.example.cm comment="Starling portal"`

Do **not** add `connectivitycheck.gstatic.com`, `captive.apple.com` or `msftconnecttest.com`: phones need those to fail in order to show the login page automatically. Mobile Money payments need **no** walled-garden entry (the approval happens on the phone's mobile network).

### 8.2 Least-privilege API user + secure API

Edit the password in `network/mikrotik/scripts/03-api-user.rsc`, then paste it into the terminal. It creates the user `starling-api` (rights: api, read, write, test only), turns on API-SSL (8729) for the VPN subnet only, and turns off telnet, ftp, www and the plain API.

### 8.3 VPN tunnel to the server

On the server, create the OpenVPN certificates ([deployment.md, section 2](deployment.md#2-openvpn-for-the-router)). Then:

1. Winbox **Files**: drag `ca.crt`, `starling-router.crt`, `starling-router.key` onto the router.
2. Terminal:

```
/certificate import file-name=ca.crt passphrase=""
/certificate import file-name=starling-router.crt passphrase=""
/certificate import file-name=starling-router.key passphrase=""
```

3. Edit `vpn.example.cm` and the password in `04-vpn-ovpn-client.rsc`, paste it. **Interfaces** shows `ovpn-starling` with **R** (running). `/ping 10.99.0.1` works.

### 8.4 Protect the router ⚠️ (Safe Mode)

Press **Ctrl+X** in the terminal (or the *Safe Mode* button in Winbox) **before** pasting `05-firewall.rsc`. If you lose the connection, the router undoes the changes automatically. When everything still works, press Ctrl+X again to keep the changes.

### 8.5 Tell the platform about the router

On the server, in `.env.production`:

```
NETWORK_ADAPTER=routeros
ROUTER_HOST=10.99.0.2
ROUTER_PORT=8729
ROUTER_TLS=true
ROUTER_TLS_INSECURE=true
ROUTER_USERNAME=starling-api
ROUTER_PASSWORD=<the password from 8.2>
ROUTER_HOTSPOT_SERVER=hotspot1
HOTSPOT_LOGIN_URL=http://10.5.50.1/login
```

Restart, then check (read-only, changes nothing):

```
docker compose -f deploy/docker-compose.prod.yml run --rm worker npm run router:check
```

The same checks are in the **console → Network → Validate configuration**. They catch every common mistake from the walkthrough:

| Check | If it fails |
|---|---|
| RouterOS version | Upgrade (Part 2.5) |
| HotSpot server `hotspot1` | Run the wizard (4.1) or set `ROUTER_HOTSPOT_SERVER` |
| **No FastTrack rule** | 4.2 |
| **Device-mode allows HotSpot** (v7) | 4.3 |
| One IP per device | 6.1 |
| Login methods (http-pap, mac-cookie) | 6.1 |
| **Custom login page present** | 5.2 (wrong folder or name) |
| **No self-logout page** | Delete `logout.html` (5.2) |
| Walled garden allows the portal | 8.1 |
| NTP / router clock | 2.4 |
| API service restricted | 8.2 |

Finally, in the console: **Network → Push profiles**.

### 8.6 Settings in the console

**Console → Settings**: business name, location, support phone, **WhatsApp number** (turns on the WhatsApp button on the website), support hours, warning times (15/5/1 min), renewal behaviour.

---

## Part 9. Test everything

Tick each line. Use a phone with **private Wi-Fi address turned off** (see Part 10).

| # | Test | Expected |
|---|---|---|
| 1 | Join `Starling Wi-Fi`, open `http://neverssl.com` | Blue Starling login page (Android/iPhone may pop up "Sign in to network" by itself) |
| 2 | *Buy a pass online* → create account → 1 Hour → pay 100 FCFA with MoMo | USSD prompt on the phone; after approval the site shows the code, status **Active** |
| 3 | Tap **Connect this device** | Router logs you in; you can browse; site shows **Online** |
| 4 | Console → **Sell a pass** → name + phone → print slip; on a second phone use *Username & password* | Logged in; the **Time left** page appears |
| 5 | Console → **Printed tickets** → 2 tickets; log in with one | Batch shows *In use 1*; that ticket's time started at the login |
| 6 | Try the same login on another phone at the same time | Refused ("no more sessions are allowed") |
| 7 | Router: `http://login.starling/status` | Time left counts down and matches the website |
| 8 | Expiry: create an inactive 5-minute package, generate 1 ticket for it, use it | Warnings, then disconnected at the end; next page is the login page |
| 9 | Unplug the VPN/server for 10 minutes | Paying customers keep browsing; expiry still happens (router scheduler) |
| 10 | Console → Network → Validate configuration | All OK |

---

## Part 10. Daily operation

### Three ways to sell

| Way | Customer does | Staff does |
|---|---|---|
| **Online** (MoMo / Orange Money) | Create account → choose pass → approve on phone → Connect | Nothing |
| **Sell a pass** (counter, cash) | Pays cash, gets a slip with username + password | Console → *Sell a pass* → print |
| **Printed tickets** (resellers, shops) | Buys a ticket, types it on the login page; time starts at first login | Console → *Printed tickets* → generate a batch → print → cut |

### Tell every customer (it is printed on the login page and website too)

* **Turn off private / random Wi-Fi address for this network**, or the Wi-Fi keeps asking them to log in:
  * Android: Settings → Wi-Fi → gear next to *Starling Wi-Fi* → Privacy / MAC address type → **Use device MAC**.
  * iPhone: Settings → Wi-Fi → ⓘ → turn off **Private Wi-Fi Address**.
* Type codes **without spaces**. Usernames are lower-case.
* One login = one device (unless the pass says 2). It cannot be moved to another phone until the time ends.

### Remote management

* Everything day to day happens in the **console** (`https://wifi.example.cm/admin`) from any phone or laptop: sales, tickets, customers, sessions, disconnects, revenue, router health.
* Winbox from far away: connect your laptop to the same OpenVPN server as a client, then Winbox to `10.99.0.2`. (RouterOS 7 routers can also use MikroTik's "Back To Home".)
* Back up the router after every change: Winbox **Files** → **Backup**, and download it; or terminal `/export file=starling-backup` and download `starling-backup.rsc` from Files.

### Support cases

| Customer says | Do |
|---|---|
| "I paid but have no code" | Console → Payments → find the number → *Re-check*. Codes appear automatically when the provider confirms |
| "It asks me to log in again and again" | Private MAC is on (see above) |
| "Wrong username or password" | Extra space or capital letters; check the slip; Console → Customers → search the username |
| "My phone broke, move my pass" | Console → Customers → the customer → **Disconnect** the old device's session; they log in on the new phone |
| Lost ticket sheet | Console → Printed tickets → **Revoke unused** for that batch |
| Forgot account password | Console → Customers → **Password reset code** (verify identity first) |

---

## Part 11. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Customers browse without logging in | FastTrack enabled (4.2), or the AP/port is not in `bridge-hotspot` (3.2), or the HotSpot is disabled (`/ip hotspot print`) |
| `/ip hotspot print` shows "not allowed by device-mode" | RouterOS 7: 4.3 |
| Still the grey MikroTik page | Files in the wrong folder or wrong name; Server Profile → HTML Directory (5.2, 6.1) |
| Login page appears but *Buy a pass online* does not load | Walled garden missing the website host (8.1) |
| All customers have the same MAC in IP → Hotspot → Hosts | Tenda is in router mode (7.2) |
| Phones get `192.168.x.x` | Tenda DHCP still on (7.2) |
| No login popup on phones | Do not whitelist captive-check domains; open `http://neverssl.com` manually |
| "no more sessions are allowed for user" | Device limit: the other device is still active (keepalive 3 h) |
| Expiry early or late | Router clock wrong: enable NTP (2.4), check `/system clock print` |
| Console shows the router "unreachable" | VPN down (`/interface ovpn-client print`), API-SSL address list, `ROUTER_*` settings |
| Slow internet for everyone | Check speed limits per profile; hAP lite CPU in `/system resource print`; above about 70 % at peak, plan a bigger router |

More: [troubleshooting.md](troubleshooting.md), [mikrotik-integration.md](mikrotik-integration.md), [access-control.md](access-control.md).

---

### Capacity of the hAP lite

The hAP lite (650 MHz CPU, 32 MB RAM, 100 Mbit/s ports) comfortably serves about **20–40 active customers**. The video's author uses an **RB750Gr3 (hEX)** and his client a **hAP ax3**; both are good upgrades when you grow. Everything in this guide and the platform works the same on them (they run RouterOS 7: remember device-mode, 4.3).
