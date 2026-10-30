-- Lost and found (owner, 30.10.2026): a feed row has a kind, and the kind sets
-- its life and its slot.
--
--   phrase  what the feed was until now; lives feed.phrase.span (4 h 20 min)
--           from the verdict and takes one of the four live slots (db/025).
--   lost    "I lost something": lives three days from the verdict, takes a slot
--           of its own — one live lost per identity, apart from the four — and
--           its author may push the end out by three days, three times at most
--           (`extend_count`; lib/feed_verdict.ts, routes/feed.ts).
--   found   a lost the author has closed: one more day in the feed so the
--           neighbours who were looking stop looking. Never sent as such;
--           only POST /feed/:id/found makes one, out of a live lost.
--
-- A closed list, as `mode` and `area_radius` are: a kind nobody named is a
-- row nobody knows how long to keep. The default is 'phrase' so that every
-- row from before this file, and every INSERT that does not name a kind,
-- stays what it was.
--
-- The CHECKs are added NOT VALID (review panel 30.10.2026): an inline CHECK on
-- a new column makes Postgres read every row of feed_messages under the ACCESS
-- EXCLUSIVE lock, and tools/migrate_db.ts runs this file in one transaction,
-- so the feed would stand still for the whole scan. Every old row holds the
-- column's default, which the CHECK accepts by construction; NOT VALID still
-- checks every INSERT and UPDATE from here on.
ALTER TABLE feed_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'phrase';
ALTER TABLE feed_messages
  ADD CONSTRAINT feed_kind CHECK (kind IN ('phrase', 'lost', 'found')) NOT VALID;
-- How many times the author pushed a lost's end out. Bounded here as well as
-- in the route: the route refuses the fourth, the CHECK refuses a writer that
-- forgot to ask.
ALTER TABLE feed_messages
  ADD COLUMN IF NOT EXISTS extend_count integer NOT NULL DEFAULT 0;
ALTER TABLE feed_messages
  ADD CONSTRAINT feed_extend_count CHECK (extend_count BETWEEN 0 AND 3) NOT VALID;
