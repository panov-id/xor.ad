-- Control state: the few things object storage cannot do — atomic counters,
-- leases, conditional writes, server-side filtering. Everything else (leads,
-- page views, errors, logs) stays in storage, where it is cheap and survives any
-- node dying. See docs/state-decision_*.md.
--
-- Applied by tools/migrate_db.ts, which records what it ran in schema_migrations.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name        text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

-- Tenants. The BRANDS environment variable stays as the bootstrap seed for the
-- platform's own faces and for a stand with no database; a row here overrides a
-- seeded brand with the same key.
CREATE TABLE IF NOT EXISTS brands (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z0-9][a-z0-9-]{1,31}$'),
  name        text NOT NULL,
  domain      text NOT NULL,
  sender      text NOT NULL,          -- "Name <hey@example.com>"
  upper       text NOT NULL,
  match       text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Publishable keys. Public by design — they ship inside a landing's JavaScript —
-- so nothing here is hashed. What protects them is the origin allowlist.
--
-- Revoking stamps the row rather than deleting it: a key that vanished would
-- take with it the answer to what it was and when we stopped trusting it.
CREATE TABLE IF NOT EXISTS api_keys (
  id          text PRIMARY KEY CHECK (id ~ '^ak_pub_[a-z0-9]{16,64}$'),
  brand       text NOT NULL REFERENCES brands(key) ON DELETE RESTRICT,
  origins     text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

-- The lookup every public request makes: by id, and only if live.
CREATE INDEX IF NOT EXISTS api_keys_live ON api_keys (id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS api_keys_by_brand ON api_keys (brand);

-- Per-key usage, one row per key per day per counter. The unique key is what
-- makes an increment atomic: ON CONFLICT DO UPDATE, not read-then-write.
--
-- Nodes flush in batches rather than counting per request: the pool spans
-- Europe and us-central1, and a round trip per public call would cost more than
-- the accuracy is worth. A quota accurate within seconds is what every API
-- lives with.
CREATE TABLE IF NOT EXISTS quota_counters (
  key_id      text NOT NULL,
  counter     text NOT NULL,          -- "events" | "webhooks" | …
  day         date NOT NULL,
  used        bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key_id, counter, day)
);

-- The job table the queue needs: a lease so a crashed worker returns its work by
-- itself, attempts so a failure is retried rather than lost, and run_at so a
-- backoff is a value rather than a sleep.
CREATE TABLE IF NOT EXISTS jobs (
  id            bigserial PRIMARY KEY,
  kind          text NOT NULL,
  payload       jsonb NOT NULL,
  run_at        timestamptz NOT NULL DEFAULT now(),
  attempts      int NOT NULL DEFAULT 0,
  max_attempts  int NOT NULL DEFAULT 8,
  locked_until  timestamptz,
  last_error    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- What a worker asks for: due, unleased, oldest first.
CREATE INDEX IF NOT EXISTS jobs_due ON jobs (run_at) WHERE locked_until IS NULL;

-- Idempotency for the public API: the same key must return the same answer, not
-- do the work twice.
CREATE TABLE IF NOT EXISTS idempotency (
  key         text PRIMARY KEY,
  brand       text NOT NULL,
  response    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Daily page-view aggregates, so a chart stops meaning "list every object".
-- The raw views stay in storage under their retention window; this is the part
-- that has to survive them.
CREATE TABLE IF NOT EXISTS pageview_daily (
  brand       text NOT NULL,
  day         date NOT NULL,
  path        text NOT NULL,
  lang        text NOT NULL,
  views       bigint NOT NULL DEFAULT 0,
  first_views bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (brand, day, path, lang)
);
