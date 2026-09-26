-- The notifier's letter about the decision (Article 16(5), dsa/SPEC_RU.md §6)
-- remembers whether it left, and keeps what it says so it can be sent again.
--
-- It went once from the decision route and its result was thrown away: a
-- refused letter left no trace and nothing tried it again, while the statement
-- of reasons next to it has delivered_at (B22, 2026-09-26). The device receipt
-- is the first channel (§6); the letter is the one for whoever may clear their
-- browser, and it is the one that could vanish.
--
-- decision_letter_facts: the "why" the letter quotes. For an upheld notice it
-- also sits in the statement; for a rejected one it was written nowhere but the
-- letter, so a retry had nothing to say. Named for the letter on purpose: it is
-- the statement's facts, which may describe the contested content, and the
-- receipt channel must not show it (§6: "причина не цитирует обжалованный
-- контент"). It goes with the notice row, a year (prune_dsa_records).
--
-- sent / attempts / leased: the arrival letter's shape (db/043), for the same
-- standing job to retry by.
ALTER TABLE dsa_notices
  ADD COLUMN IF NOT EXISTS decision_letter_facts  text,
  ADD COLUMN IF NOT EXISTS decision_sent_at       timestamptz,
  ADD COLUMN IF NOT EXISTS decision_attempts      int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS decision_leased_until  timestamptz;

-- Notices decided before this file are not news to anyone: their letter either
-- left or was lost long ago, and its text was never kept, so there is nothing
-- to send again. Marked as sent at their decision, as db/043 did for arrivals.
UPDATE dsa_notices SET decision_sent_at = decided_at
 WHERE decided_at IS NOT NULL AND decision_sent_at IS NULL;
