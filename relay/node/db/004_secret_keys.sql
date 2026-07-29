-- Server-to-server keys, beside the publishable ones.
--
-- A publishable key is public by design: it ships inside a landing page, names
-- the tenant, and is fenced by an origin allowlist. A secret key is the
-- opposite — it is shown once, at creation, and only its sha256 is kept here.
-- Losing it means minting another, because there is nothing to read back.
--
-- One table for both, not two: they are the same thing to every reader (which
-- tenant, is it live, when was it revoked), and splitting them would double
-- every lookup and every page that lists them.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_id_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_id_check
  CHECK (id ~ '^ak_(pub|live)_[a-z0-9]{16,64}$');

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS kind        text NOT NULL DEFAULT 'publishable',
  -- sha256 of the secret, hex. Null for publishable keys: there is no secret to
  -- hash, the id is the whole key.
  ADD COLUMN IF NOT EXISTS secret_hash text,
  -- What a person calls it in the panel: "sosed.place importer". A key nobody
  -- can name is a key nobody dares revoke.
  ADD COLUMN IF NOT EXISTS name        text NOT NULL DEFAULT '',
  -- The same permission strings roles use (src/access/permissions.ts). A second
  -- vocabulary for keys would drift from the first one within a release.
  ADD COLUMN IF NOT EXISTS scopes      text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_by  text,
  -- Stamped on use, best-effort: it answers "is this key still in use" before a
  -- revocation, which is the question that stops one being left alive forever.
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_kind_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_kind_check CHECK (kind IN ('publishable', 'secret'));

-- A secret key without its hash could never be verified, and a publishable one
-- with a hash would imply a secret that does not exist.
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_secret_shape;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_secret_shape CHECK (
    (kind = 'secret' AND secret_hash IS NOT NULL) OR
    (kind = 'publishable' AND secret_hash IS NULL)
  );

-- The lookup every server-to-server request makes: by hash, and only if live.
CREATE INDEX IF NOT EXISTS api_keys_by_secret ON api_keys (secret_hash)
  WHERE revoked_at IS NULL;
