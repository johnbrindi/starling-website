# =====================================================================================
# Starling Wi-Fi :: 03 least-privilege API account for the platform
# SAFE to apply on a live router (adds a group/user and restricts services).
# Replace the password; restrict to the VPN address of the application server.
# =====================================================================================

# The platform needs: api (protocol), read, write (hotspot users, active sessions, scheduler), test.
# It does NOT need: policy, ssh, ftp, winbox, web, reboot, password, sensitive, sniff, romon.
/user group add name=starling-api policy=api,read,write,test,!local,!telnet,!ssh,!ftp,!reboot,!policy,!winbox,!password,!web,!sniff,!sensitive,!romon,!dude,!tikapp \
    comment="Starling Wi-Fi platform (API only)"
/user add name=starling-api group=starling-api password="CHANGE-ME-long-random" address=10.99.0.0/24 \
    comment="Used by the Starling server over the VPN"

# Only the API-SSL service, only from the VPN subnet. Plain API (8728) disabled.
/certificate add name=api-ssl-cert common-name=starling-hotspot days-valid=3650 key-size=2048
/certificate sign api-ssl-cert
/ip service
set api disabled=yes
set api-ssl disabled=no certificate=api-ssl-cert address=10.99.0.0/24
set telnet disabled=yes
set ftp disabled=yes
set www disabled=yes
set ssh address=192.168.88.0/24,10.99.0.0/24
set winbox address=192.168.88.0/24,10.99.0.0/24
