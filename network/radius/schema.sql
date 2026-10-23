-- =====================================================================================
-- Starling Wi-Fi :: OPTIONAL RADIUS integration (NETWORK_ADAPTER=radius). See docs/radius.md.
-- FreeRADIUS (rlm_sql, PostgreSQL dialect) reads entitlements from these VIEWS, which are computed
-- live from the platform tables. An expired, revoked or blocked customer simply disappears from
-- radcheck, and Session-Timeout makes the NAS end the session exactly at validUntil.
-- Apply manually:  psql "$DATABASE_URL" -f network/radius/schema.sql
-- Assumes the access code is both username and password (the platform's default credential scheme).
-- =====================================================================================

CREATE SCHEMA IF NOT EXISTS radius;

CREATE OR REPLACE VIEW radius.entitled AS
SELECT c.username,
       c."maxDevices"      AS max_devices,
       c."rateLimit"       AS rate_limit,
       c."dataLimitBytes"  AS data_limit_bytes,
       GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (c."validUntil" - now()))))::bigint AS seconds_left
  FROM public."AccessCredential" c
  JOIN public."Customer" cu ON cu.id = c."customerId"
 WHERE c.status = 'ACTIVE'
   AND c."validFrom" <= now()
   AND c."validUntil" > now()
   AND NOT cu."isBlocked";

CREATE OR REPLACE VIEW radius.radcheck AS
SELECT row_number() OVER ()::int AS id, username, attribute, op, value FROM (
  SELECT username, 'Cleartext-Password'::text AS attribute, ':='::text AS op, username AS value FROM radius.entitled
  UNION ALL
  SELECT username, 'Simultaneous-Use', ':=', max_devices::text FROM radius.entitled
) t;

CREATE OR REPLACE VIEW radius.radreply AS
SELECT row_number() OVER ()::int AS id, username, attribute, op, value FROM (
  SELECT username, 'Session-Timeout'::text AS attribute, ':='::text AS op, seconds_left::text AS value FROM radius.entitled
  UNION ALL
  SELECT username, 'Mikrotik-Rate-Limit', ':=', rate_limit FROM radius.entitled WHERE rate_limit IS NOT NULL
  UNION ALL
  SELECT username, 'Mikrotik-Total-Limit', ':=', (data_limit_bytes % 4294967296)::text FROM radius.entitled WHERE data_limit_bytes IS NOT NULL
  UNION ALL
  SELECT username, 'Mikrotik-Total-Limit-Gigawords', ':=', (data_limit_bytes / 4294967296)::text FROM radius.entitled WHERE data_limit_bytes IS NOT NULL
) t;

-- Group tables are unused but expected by the default FreeRADIUS queries.
CREATE TABLE IF NOT EXISTS radius.radusergroup (id serial PRIMARY KEY, username text NOT NULL DEFAULT '', groupname text NOT NULL DEFAULT '', priority int NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS radius.radgroupcheck (id serial PRIMARY KEY, groupname text NOT NULL DEFAULT '', attribute text NOT NULL DEFAULT '', op varchar(2) NOT NULL DEFAULT '==', value text NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS radius.radgroupreply (id serial PRIMARY KEY, groupname text NOT NULL DEFAULT '', attribute text NOT NULL DEFAULT '', op varchar(2) NOT NULL DEFAULT '=', value text NOT NULL DEFAULT '');

-- Accounting (standard FreeRADIUS 3.x PostgreSQL layout; use the file shipped with your
-- FreeRADIUS version if it differs). The platform reads open sessions from here.
CREATE TABLE IF NOT EXISTS radius.radacct (
  radacctid           bigserial PRIMARY KEY,
  acctsessionid       text NOT NULL,
  acctuniqueid        text NOT NULL UNIQUE,
  username            text,
  realm               text,
  nasipaddress        inet NOT NULL,
  nasportid           text,
  nasporttype         text,
  acctstarttime       timestamptz,
  acctupdatetime      timestamptz,
  acctstoptime        timestamptz,
  acctinterval        bigint,
  acctsessiontime     bigint,
  acctauthentic       text,
  connectinfo_start   text,
  connectinfo_stop    text,
  acctinputoctets     bigint,
  acctoutputoctets    bigint,
  calledstationid     text,
  callingstationid    text,
  acctterminatecause  text,
  servicetype         text,
  framedprotocol      text,
  framedipaddress     inet,
  framedipv6address   inet,
  framedipv6prefix    inet,
  framedinterfaceid   text,
  delegatedipv6prefix inet,
  class               text
);
CREATE INDEX IF NOT EXISTS radacct_active_idx ON radius.radacct (acctstoptime) WHERE acctstoptime IS NULL;
CREATE INDEX IF NOT EXISTS radacct_username_idx ON radius.radacct (username);

CREATE TABLE IF NOT EXISTS radius.radpostauth (
  id bigserial PRIMARY KEY, username text NOT NULL, pass text, reply text,
  calledstationid text, callingstationid text, authdate timestamptz NOT NULL DEFAULT now(), class text
);

-- Least-privilege role for FreeRADIUS: read entitlements, write accounting only.
-- CREATE ROLE freeradius LOGIN PASSWORD 'CHANGE-ME';
-- GRANT USAGE ON SCHEMA radius TO freeradius;
-- GRANT SELECT ON radius.radcheck, radius.radreply, radius.radusergroup, radius.radgroupcheck, radius.radgroupreply TO freeradius;
-- GRANT SELECT, INSERT, UPDATE ON radius.radacct, radius.radpostauth TO freeradius;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA radius TO freeradius;
-- The views read public tables as their owner, so freeradius needs no access to public.*
