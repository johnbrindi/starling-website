# =====================================================================================
# Starling Wi-Fi :: 05 router protection (input chain)
# ⚠ Can lock you out if adapted wrongly. Apply from a LAN/management port, and keep Safe Mode
#   (Ctrl+X in the terminal / "Safe Mode" in Winbox) ON while applying.
# HotSpot adds its own dynamic rules for customer traffic; these rules protect the router itself.
# =====================================================================================

/ip firewall filter
add chain=input action=accept connection-state=established,related comment="Starling: allow established"
add chain=input action=drop connection-state=invalid comment="Starling: drop invalid"
add chain=input action=accept protocol=icmp limit=10,20:packet comment="Starling: ping (rate limited)"
add chain=input action=accept in-interface=ovpn-starling protocol=tcp dst-port=8729 comment="Starling: API-SSL from app server (VPN only)"
add chain=input action=accept in-interface=bridge-hotspot protocol=udp dst-port=53,67 comment="Starling: DNS + DHCP for customers"
add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=53,64872-64875 comment="Starling: DNS/TCP + hotspot internal"
add chain=input action=accept in-interface=bridge-hotspot protocol=tcp dst-port=80 comment="Starling: hotspot login page"
add chain=input action=accept src-address=192.168.88.0/24 comment="Starling: management LAN (if configured)"
add chain=input action=drop in-interface=ether1 comment="Starling: drop everything else from WAN"
add chain=input action=drop in-interface=bridge-hotspot comment="Starling: customers cannot reach router services"

# Customers must not reach each other or the management network.
add chain=forward action=drop in-interface=bridge-hotspot dst-address=192.168.88.0/24 comment="Starling: block customers -> management"
add chain=forward action=drop in-interface=bridge-hotspot out-interface=ovpn-starling comment="Starling: block customers -> VPN"

# Stop customers using another DNS server to bypass the walled garden.
/ip firewall nat add chain=dstnat in-interface=bridge-hotspot protocol=udp dst-port=53 action=redirect to-ports=53 comment="Starling: force DNS"
