# =====================================================================================
# Starling Wi-Fi :: 01 base network for a MikroTik hAP lite (RB941-2nD), RouterOS 6.49.x
# ⚠ DISRUPTIVE: changes interfaces, addressing, DHCP and NAT. Apply ONLY on a freshly reset
#   router (System > Reset Configuration > No Default Configuration) while connected to the
#   router's MAC address with Winbox. Read docs/network-integration-guide.md first.
#
# Ports:  ether1 = WAN  (from Starlink router LAN port / Starlink Ethernet adapter)
#         ether2-ether4 + wlan1 = customer side (Tenda AP plugs into ether2)
# Customer subnet: 10.5.50.0/24, router 10.5.50.1
# =====================================================================================

/system identity set name=starling-hotspot
/system clock set time-zone-name=Africa/Douala
/system ntp client set enabled=yes primary-ntp=162.159.200.1 secondary-ntp=162.159.200.123

# WAN: Starlink hands out an address by DHCP (CGNAT 100.64.x.x in bypass mode, 192.168.1.x otherwise)
/ip dhcp-client add interface=ether1 disabled=no add-default-route=yes use-peer-dns=no comment="WAN Starlink"
/ip dns set servers=1.1.1.1,8.8.8.8 allow-remote-requests=yes cache-size=4096KiB

# Customer bridge
/interface bridge add name=bridge-hotspot protocol-mode=none comment="Customers (Tenda AP + local ports)"
/interface bridge port
add bridge=bridge-hotspot interface=ether2
add bridge=bridge-hotspot interface=ether3
add bridge=bridge-hotspot interface=ether4
# Optional: also use the hAP lite's own 2.4 GHz radio as an open customer SSID.
/interface wireless set [ find default-name=wlan1 ] mode=ap-bridge ssid="Starling Wi-Fi" band=2ghz-b/g/n frequency=auto disabled=yes
/interface bridge port add bridge=bridge-hotspot interface=wlan1

/ip address add address=10.5.50.1/24 interface=bridge-hotspot comment="Customer gateway"
/ip pool add name=pool-hotspot ranges=10.5.50.10-10.5.50.250
/ip dhcp-server add name=dhcp-hotspot interface=bridge-hotspot address-pool=pool-hotspot lease-time=1h disabled=no
/ip dhcp-server network add address=10.5.50.0/24 gateway=10.5.50.1 dns-server=10.5.50.1 comment="Customers"

# NAT to the internet
/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment="Starling: NAT to Starlink"

# Management VLAN-less fallback: a dedicated management port is recommended. Keep ether4 for
# your laptop by removing it from the bridge and giving it 192.168.88.1/24 if you prefer.
