# =====================================================================================
# Starling Wi-Fi :: 06 OPTIONAL - switch the HotSpot to RADIUS (FreeRADIUS on the app server)
# Only if NETWORK_ADAPTER=radius. See docs/radius.md. SAFE to stage; flips logins when applied.
# =====================================================================================
/radius add service=hotspot address=10.99.0.1 secret="CHANGE-ME-radius-secret" src-address=10.99.0.2 timeout=3s comment="Starling FreeRADIUS"
/radius incoming set accept=yes port=3799
/ip hotspot profile set hsprof-starling use-radius=yes radius-accounting=yes radius-interim-update=1m
