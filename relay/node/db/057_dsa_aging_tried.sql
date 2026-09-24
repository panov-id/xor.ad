-- When watchdog С1 last took a notice into a pass (dsa.aging.escalation.order).
--
-- An escalation whose letter keeps failing at one address gives its stamp back
-- and was, by age, first again the next pass: 200 of them held a newer one for
-- as long as they kept failing (verifier, 2026-09-25). The pick now puts the
-- never-tried first and the longest-ago tried next, so a failing head of the
-- queue takes turns with the rest instead of standing on it (decided by quorum
-- 2026-09-25, five of five: a time, not a counter — a counter would need
-- resetting, a time does not).
ALTER TABLE dsa_notices ADD COLUMN IF NOT EXISTS aging_tried_at timestamptz;
