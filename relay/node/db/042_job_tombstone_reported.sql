-- Watchdog С3 (docs/watchdogs_RU.md): a tombstone of prune_dsa_records is an
-- urgent letter — that job's period is promised in the privacy policy. One
-- letter per tombstone, not per pass: a job that always fails makes a new
-- tombstone about once a day after the hourly re-arm, and each of those is news;
-- the same one every hour is not. The stamp says the letter about this row left.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reported_at timestamptz;

-- Tombstones already lying there when this arrives are old news, not urgent:
-- without this the first pass after the rollout would send a letter about every
-- one of the last thirty days (review panel, 23.09.2026).
UPDATE jobs SET reported_at = now()
 WHERE locked_until = 'infinity' AND reported_at IS NULL;
