# RADIUS mode (optional)

The default design provisions local HotSpot users through the API (see [architecture](architecture.md#key-decisions)). RADIUS is the growth path for multiple routers or sites. Everything below is implemented in this repository, but it needs a FreeRADIUS server that you run.

## Responsibilities

| Part | Responsibility |
|---|---|
| Application + DB | Source of truth for entitlements (`AccessCredential`). SQL views compute, at every login, who is entitled and with which limits |
| FreeRADIUS | Authenticates HotSpot logins against `radius.radcheck`; returns `radius.radreply` (Session-Timeout, rate limit, data cap); writes accounting to `radius.radacct` |
| MikroTik | Asks RADIUS on login; enforces the reply; sends interim accounting every minute; accepts Disconnect-Requests (RFC 5176, UDP 3799) |
| Worker (`RadiusAdapter`) | Reads open sessions from `radacct`, sends Disconnect-Requests for expired/revoked users |

Advantages: expiry is exact (`Session-Timeout` = seconds left at login), there's no per-user state on routers, and any number of routers can share one database. Disadvantage: when RADIUS or the VPN is unreachable, **nobody can log in**. On a single Starlink site that is a real risk, which is why it is not the default.

## Setup

1. Database: `psql "$DATABASE_URL" -f network/radius/schema.sql`. Create the `freeradius` role (commands at the end of the file). It gets read access to the views and write access to accounting only.
2. FreeRADIUS 3.x on the VPS (`apt install freeradius freeradius-postgresql`):
   * `network/radius/freeradius/mods-available-sql.conf` goes in `mods-available/sql` (enable it). Uncomment `sql` in `sites-enabled/default` under `authorize`, `accounting`, `session` and `post-auth`.
   * `network/radius/freeradius/clients.conf`: the router at `10.99.0.2` with a strong shared secret.
   * For `Simultaneous-Use` to work, the `session { sql }` section must be enabled. Otherwise rely on the profile's `shared-users` on the router.
   * Test: `radtest <CODE> <CODE> 127.0.0.1 0 testing123`.
3. Router: `network/mikrotik/scripts/06-radius-optional.rsc` (RADIUS client + incoming CoA + `use-radius=yes`).
4. App: `NETWORK_ADAPTER=radius`, `RADIUS_NAS_HOST=10.99.0.2`, `RADIUS_COA_PORT=3799`, `RADIUS_SECRET=<same secret>`.

The secret must stay off the internet and out of client code. The RADIUS UDP ports are only open on the VPN interface.

## Verified in this repository

* `schema.sql` applied to PostgreSQL 17, and the views return `Cleartext-Password`, `Simultaneous-Use` and `Session-Timeout` for an entitled demo credential.
* `buildDisconnectRequest` is unit-tested for RFC 5176 packet layout and Request Authenticator.
* **Not verified**: a live FreeRADIUS ↔ MikroTik exchange (needs the server and hardware).
