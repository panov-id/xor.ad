-- Which addresses a watchdog С1 letter about a notice reached, by stage.
--
-- A notice whose letter failed at one address lost its stamp and went again
-- to every address, the ones that had it too: one address that always fails
-- made the healthy one receive the same notices every ten minutes, 42 letters
-- in an hour past a ceiling of six (verifier, 2026-09-24). With this the retry
-- goes only where the letter did not arrive. The address is kept as its
-- SHA-256, never in the clear, and leaves with the notice (ON DELETE CASCADE,
-- prune_dsa_records).
CREATE TABLE IF NOT EXISTS dsa_notice_letters (
  notice_id     uuid NOT NULL REFERENCES dsa_notices (id) ON DELETE CASCADE,
  stage         text NOT NULL CHECK (stage IN ('remind', 'escalate')),
  address_hash  text NOT NULL CHECK (address_hash ~ '^[0-9a-f]{64}$'),
  sent_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, stage, address_hash)
);
