# Deployment

## Recommended layout

A small **VPS** (any provider with a public IPv4; 1 vCPU, 1–2 GB RAM, Ubuntu 24.04) runs:

* `web` (Next.js), `worker` (background jobs), and `caddy` (TLS) from `deploy/docker-compose.prod.yml`;
* the **OpenVPN server** for the router's management tunnel.

The database is **Supabase** (already provisioned and migrated).

Why not Vercel or other serverless hosts alone? The worker must reach the router through the VPN, and serverless platforms can't hold a VPN tunnel. You *can* host only the web app on a serverless platform and still run the worker on a small machine that holds the tunnel. The `/api/cron/tick` endpoint exists for that split.

## 1. Server

```bash
apt update && apt install -y docker.io docker-compose-v2 openvpn easy-rsa ufw
ufw default deny incoming && ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 1194/tcp && ufw enable
timedatectl set-timezone Africa/Douala
```

DNS: `A wifi.example.cm → VPS IP`, `A vpn.example.cm → VPS IP`.

## 2. OpenVPN for the router

```bash
make-cadir /etc/openvpn/easy-rsa && cd /etc/openvpn/easy-rsa
./easyrsa init-pki && ./easyrsa build-ca nopass
./easyrsa build-server-full server nopass && ./easyrsa build-client-full starling-router nopass && ./easyrsa gen-dh
cp -r pki /etc/openvpn/pki
mkdir -p /etc/openvpn/ccd && echo "ifconfig-push 10.99.0.2 255.255.255.0" > /etc/openvpn/ccd/starling-router
cp <repo>/deploy/openvpn-server.conf.example /etc/openvpn/server.conf
systemctl enable --now openvpn@server
```

Copy `pki/ca.crt`, `pki/issued/starling-router.crt`, and `pki/private/starling-router.key` to the router (see the network guide, step 7). Treat the key as a secret.

## 3. Application

```bash
git clone https://github.com/johnbrindi/starling-website.git /opt/starling && cd /opt/starling
cp .env.example .env.production   # fill it in (see environment-variables.md)
npm ci && npm run keys:generate   # or run keys:generate on your laptop
```

Production values to set: `NODE_ENV=production`, `APP_URL=https://wifi.example.cm`, `TRUST_PROXY=true`, `PAYMENT_PROVIDER=notchpay` + keys, `ALLOW_SIMULATED_PAYMENTS=false`, `NETWORK_ADAPTER=routeros`, `ALLOW_FAKE_NETWORK=false`, the router variables, `DATABASE_URL` (+ `DATABASE_CA_CERT`), VAPID keys, `TZ=Africa/Douala`.

Edit `deploy/Caddyfile` with your domain, then:

```bash
docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml run --rm worker npm run db:deploy
docker compose -f deploy/docker-compose.prod.yml run --rm worker npm run db:seed        # packages only in production
docker compose -f deploy/docker-compose.prod.yml run --rm -it worker npm run admin:create -- you@example.com "Your Name"
docker compose -f deploy/docker-compose.prod.yml up -d    # Start the stack
```

The worker runs with host networking so it can reach `10.99.0.2` over `tun0`. Caddy obtains Let's Encrypt certificates automatically.

## 4. Payment webhook

Notch Pay dashboard → webhook URL `https://wifi.example.cm/api/webhooks/notchpay`, then send a test event (see [payments](payments.md#webhook-setup)).

## Monitoring

* Uptime monitor on `https://wifi.example.cm/api/health` (no secrets in the response).
* Console dashboard: router health, dead jobs, paid-but-not-provisioned codes, failed payments.
* Logs: `docker compose logs -f worker web`. JSON lines with redacted fields; look for `"level":"error"`.
* Router: `/system resource print` (CPU), `/ip hotspot active print count-only`.

## Updates

```bash
git pull && docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml run --rm worker npm run db:deploy
docker compose -f deploy/docker-compose.prod.yml up -d
```

Migrations are additive; deploy them before the new code. The service worker updates itself, and users see an *Update* prompt. Bump `VERSION` in `public/sw.js` when you change it.

## Backups

See [database.md](database.md#backups-and-recovery). Also back up `.env.production` (encrypted, off-server) and the OpenVPN PKI.

## Launch checklist

- [ ] RouterOS upgraded to latest 6.49.x long-term; router backup exported
- [ ] Router admin password changed; `api` (8728), `telnet`, `ftp`, `www` disabled; API-SSL limited to `10.99.0.0/24`
- [ ] Tenda in AP mode, DHCP off, admin password changed, client isolation on
- [ ] `npm run router:check` all OK; profiles pushed
- [ ] Walled garden contains only the portal host; captive-portal popup appears on Android and iPhone
- [ ] `NODE_ENV=production`; app starts (proves no simulator/fake router configured)
- [ ] Notch Pay live keys; webhook test event shows `processedAt`; one real 100 XAF purchase end to end
- [ ] Expiry test with a voucher for a short inactive package: warning received, device disconnected at the end
- [ ] Super admin created with `admin:create`; no `@starling.local` accounts exist in production
- [ ] Supabase network restrictions to the VPS IP; backups/PITR enabled; `ENCRYPTION_KEY` backed up
- [ ] Support phone/WhatsApp, business name and location set in Console → Settings
- [ ] Terms and privacy reviewed (see [access-control](access-control.md#compliance-items-to-confirm))
- [ ] Load check at peak: router CPU < 70 % (otherwise plan a router upgrade)
