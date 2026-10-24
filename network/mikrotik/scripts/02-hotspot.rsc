# =====================================================================================
# Starling Wi-Fi :: 02 HotSpot, user profiles and walled garden
# ⚠ DISRUPTIVE for customers: once enabled, every device on bridge-hotspot must log in.
# Replace wifi.example.cm with the host name of your APP_URL before applying.
# Upload network/mikrotik/hotspot/*.html to the router folder "starling" first (Files / FTP / Winbox drag-drop).
# =====================================================================================

# dns-name is what customers see in the address bar of the login page (use your business name).
# login-by: http-pap (portal "Connect" button + our login page), http-chap, mac-cookie (a returning
# phone is logged back in automatically), cookie.
/ip hotspot profile add name=hsprof-starling hotspot-address=10.5.50.1 dns-name=login.starling \
    html-directory=starling login-by=http-pap,http-chap,mac-cookie,cookie http-cookie-lifetime=1d \
    use-radius=no rate-limit="" split-user-domain=no smtp-server=0.0.0.0

# addresses-per-mac=1: each device gets exactly one IP.
/ip hotspot add name=hotspot1 interface=bridge-hotspot address-pool=pool-hotspot profile=hsprof-starling \
    addresses-per-mac=1 disabled=no

# User profiles referenced by packages (also editable in the console: Network > User profiles > Push profiles).
#   shared-users      = devices that may use one login at the same time
#   idle-timeout=none = an idle customer is not logged out; they leave when their time ends
#   keepalive-timeout = how long a device that switched Wi-Fi off keeps its slot. 3h stops one login being
#                       passed to a friend's phone (customers must disable "private/random MAC", see guide)
#   status-autorefresh= how often the router's "time left" page refreshes
/ip hotspot user profile
add name=starling-default rate-limit=2M/4M shared-users=1 idle-timeout=none keepalive-timeout=3h status-autorefresh=1m add-mac-cookie=yes
add name=starling-2dev rate-limit=2M/4M shared-users=2 idle-timeout=none keepalive-timeout=3h status-autorefresh=1m add-mac-cookie=yes

# If you kept MikroTik's default configuration: FastTrack lets traffic skip the hotspot. Disable it.
:foreach r in=[/ip firewall filter find action=fasttrack-connection] do={ /ip firewall filter disable $r }

# ---- Walled garden: what unauthenticated devices may reach --------------------------
# Only the portal. Payments use Notch Pay "direct charge" (server-to-server + USSD prompt on the
# phone), so customers do NOT need to reach the payment provider before logging in.
# Use walled-garden "ip" entries: they work for HTTPS (matched on the resolved IP, no TLS inspection).
/ip hotspot walled-garden ip
add action=accept dst-host=wifi.example.cm comment="Starling portal (APP_URL host)"
# If you later use a hosted payment page (redirect checkout), also allow it, e.g.:
# add action=accept dst-host=pay.notchpay.co comment="Hosted payment page (only if used)"

# Do NOT whitelist captive-portal detection hosts (connectivitycheck.gstatic.com, captive.apple.com,
# www.msftconnecttest.com): phones must see them fail so they open the login page automatically.
