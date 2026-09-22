-- Support requests (chat spec §13, the eleventh table of the first slice,
-- added 2026-09-14; protocol §4.10; screen 14). Exactly the spec's DDL.
CREATE TABLE IF NOT EXISTS support_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_no    text NOT NULL UNIQUE CHECK (public_no ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  identity     uuid REFERENCES identities(id) ON DELETE SET NULL,
  body         text NOT NULL,
  email        text,
  from_frozen  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  answer       text,
  answered_at  timestamptz,
  answer_seen  boolean NOT NULL DEFAULT false,
  CHECK (answer_seen = false OR answer IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS support_by_identity ON support_requests (identity, created_at DESC) WHERE identity IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_by_created ON support_requests (created_at);
