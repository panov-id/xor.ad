-- Watchdog С2 (docs/watchdogs_RU.md): the notice remembers whether the letter
-- saying it arrived ever left. The spec first said "a job dsa_notice_notify per
-- notice"; the queue refuses that — jobs_standing (db/020) is unique on kind, so
-- a second failed notice could not queue its retry at all (found by the С2
-- suite, 23.09.2026). One standing job reads these columns instead.
ALTER TABLE dsa_notices
  ADD COLUMN IF NOT EXISTS arrival_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS arrival_attempts     int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS arrival_escalated_at timestamptz,
  -- The lease of a pass sending the letter: taken in one short statement, so
  -- no transaction holds the row while mail goes — a moderator's decision locks
  -- the same row (routes/dsa.ts) and must not wait on a mail provider.
  ADD COLUMN IF NOT EXISTS arrival_leased_until timestamptz;

-- Notices older than this are not news: whatever their letter did, it is not
-- going to be retried now. Only rows from here on are watched.
UPDATE dsa_notices SET arrival_sent_at = created_at WHERE arrival_sent_at IS NULL;
