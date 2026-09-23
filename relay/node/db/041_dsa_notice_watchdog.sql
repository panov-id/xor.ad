-- Watchdog С1 (docs/watchdogs_RU.md): a notice under Article 16 that nobody
-- looked at must not lie there silently. Two stamps, so a reminder and an
-- escalation go once each rather than every hour — a letter an hour makes the
-- channel unreadable, and an unread channel is the same as no watchdog.
ALTER TABLE dsa_notices
  ADD COLUMN IF NOT EXISTS reminded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

-- No index of its own. One was here with the predicate `escalated_at IS NULL`,
-- and EXPLAIN never chose it: the watchdog's reminder branch does not imply
-- that predicate, so Postgres cannot use the partial index for the query at all
-- (review panel, 23.09.2026). dsa_notices_queue (005) already serves it.
