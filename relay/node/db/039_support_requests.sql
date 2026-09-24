-- Support requests (chat spec §13, the eleventh table of the first slice,
-- added 2026-09-14; protocol §4.10; screen 14). The spec's DDL, plus the storefront's brand below.
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
  -- The storefront a request came through — the owner's decision of
  -- 2026-09-22: the team's daily digest (chat spec §13) goes to each
  -- storefront's own support@<domain>, and without the brand the node could not
  -- tell whose mailbox a request belongs to. Attribution, like
  -- feed_messages.brand: no foreign key, a face can be retired without
  -- orphaning rows. NULL — a request sent without a storefront's key.
  brand        text,
  CHECK (answer_seen = false OR answer IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS support_by_identity ON support_requests (identity, created_at DESC) WHERE identity IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_by_created ON support_requests (created_at);
CREATE INDEX IF NOT EXISTS support_by_brand_created ON support_requests (brand, created_at);
