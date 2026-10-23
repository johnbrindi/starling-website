# =====================================================================================
# Starling Wi-Fi :: 04 management tunnel from the router to the application server
# Starlink uses CGNAT, so the server cannot connect to the router directly. The router dials OUT
# to the server's OpenVPN (TCP) endpoint; the server then reaches the router API at 10.99.0.2.
# RouterOS v6 OpenVPN: TCP only, AES-CBC + SHA1. See docs/deployment.md for the server side.
# SAFE: adds an interface; does not affect customers.
# Import the CA and client certificate files first (Files), then:
#   /certificate import file-name=ca.crt
#   /certificate import file-name=starling-router.crt
#   /certificate import file-name=starling-router.key
# =====================================================================================

/interface ovpn-client add name=ovpn-starling connect-to=vpn.example.cm port=1194 mode=ip \
    user=starling-router password="CHANGE-ME" certificate=starling-router.crt_0 \
    cipher=aes256 auth=sha1 add-default-route=no disabled=no comment="Management tunnel to app server"

# Nothing else is routed through the tunnel: customer traffic always goes out via Starlink.
