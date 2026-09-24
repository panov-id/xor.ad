-- A business profile goes a year after its last offer (offers spec, retention;
-- privacy policy §5: "deleted a year after its last offer"). db/050 made the
-- tables and nothing deleted from them (business.profile.retention).
--
-- Why a venue was suspended decides what its deletion leaves: suspended for
-- systematic justified complaints (10.2), a keyed hash of its address and the
-- date stay one more year, so waiting out the year does not lift it; suspended
-- by the venue's own "this is not us" (11), nothing stays — the venue was the
-- victim there. Nothing sets the reason yet (the moderation of venues is not
-- built); the sweeper reads it.
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS suspended_at     timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_reason text
    CHECK (suspended_reason IS NULL OR suspended_reason IN ('systematic', 'not_us'));

-- The address as HMAC-SHA256 on a key the node keeps outside the database: a
-- pseudonym with a term, not an anonymisation (the spec says so).
CREATE TABLE IF NOT EXISTS venue_suspensions (
  address_hmac  text PRIMARY KEY CHECK (address_hmac ~ '^[0-9a-f]{64}$'),
  suspended_at  timestamptz NOT NULL,
  keep_until    timestamptz NOT NULL
);
