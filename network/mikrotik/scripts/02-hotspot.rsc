# =====================================================================================
# Starling Wi-Fi :: 02 HotSpot, user profiles and walled garden
# ⚠ DISRUPTIVE for customers: once enabled, every device on bridge-hotspot must log in.
# Replace wifi.example.cm with the host name of your APP_URL before applying.
# Upload network/mikrotik/hotspot/*.html to the router folder "starling" first (Files / FTP / Winbox drag-drop).
# =====================================================================================

/ip hotspot profile add name=hsprof-starling hotspot-address=10.5.50.1 dns-name=login.wifi \
    html-directory=starling login-by=http-pap,http-chap,cookie http-cookie-lifetime=1d \
    use-radius=no rate-limit="" split-user-domain=no

/ip hotspot add name=hotspot1 interface=bridge-hotspot address-pool=pool-hotspot profile=hsprof-starling \
    idle-timeout=5m keepalive-timeout=2m addresses-per-mac=2 disabled=no

# User profiles referenced by packages (also creatable from the console: Network > Push profiles).
/ip hotspot user profile
add name=starling-default rate-limit=2M/4M shared-users=1 idle-timeout=10m keepalive-timeout=2m add-mac-cookie=yes
add name=starling-2dev rate-limit=2M/4M shared-users=2 idle-timeout=10m keepalive-timeout=2m add-mac-cookie=yes

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
