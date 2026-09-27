-- The envelope with a code that proves a venue's address (offers/SPEC_RU.md
-- §11): thirty days, counted attempts, burned after too many wrong ones.
--
-- The code itself is kept until the envelope is used or burned, because an
-- operator has to print it; the lookup goes by its hash, so the "not us" page
-- finds an envelope without comparing plain codes in SQL.
CREATE TABLE venue_envelopes (
  id          uuid PRIMARY KEY,
  venue_id    uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  code        text,                               -- for printing; NULL once spent
  code_hash   text NOT NULL UNIQUE CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  attempts    integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,                        -- the right code was entered
  burned_at   timestamptz,                        -- too many wrong ones, or superseded
  created_at  timestamptz NOT NULL DEFAULT now()
);
-- One live envelope per venue: a second order supersedes the first.
CREATE UNIQUE INDEX venue_envelopes_live ON venue_envelopes (venue_id)
  WHERE used_at IS NULL AND burned_at IS NULL;
