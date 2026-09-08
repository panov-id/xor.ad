-- Two things the queue relied on the code to be careful about.
--
-- First: "one standing job per kind". `enqueueOnce` reads, then writes, and
-- nothing between the two stops a second node from doing the same — and both
-- nodes start together on every deploy. The result is two prune chains, each
-- re-arming itself for the next day, for ever: duplicates never disappear
-- because only a successful run deletes a row, and each chain re-arms its own.
-- A partial unique index makes the database refuse the second insert, which is
-- the only place the decision can be made atomically.
--
-- Tombstones are excluded: `locked_until = 'infinity'` marks a job that gave up
-- and is kept as evidence (db/001, jobs.ts). Counting it as "already standing"
-- would block the next arming for ever, which is the defect a review panel found
-- on 2026-09-07 — the index must not bring it back.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_standing
  ON jobs (kind)
  WHERE locked_until IS DISTINCT FROM 'infinity';

-- Second: a worker finishing a job it no longer holds. The lease is ten minutes
-- and the object prunes walk storage one delete at a time, so overrunning it is
-- ordinary rather than exotic; when it happens another node claims the same row
-- and both are working. Whoever finishes first deletes the row, the other then
-- deletes a row that is already gone and calls itself successful — and both
-- re-arm the next day's job.
--
-- A lease token makes "the row I hold" expressible: claim() stamps it, finish()
-- names it, and a worker whose lease was taken away changes nothing.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lease uuid;

COMMENT ON COLUMN jobs.lease IS
  'Token of the current claim. Set by claim(), required by finish(): a worker '
  'whose lease expired and was taken by another node must not delete or reschedule '
  'the row it no longer holds.';
