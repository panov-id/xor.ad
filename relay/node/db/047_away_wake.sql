-- A time away that ends by itself wakes the rooms it held.
--
-- A room open while its person is away is handed nothing (src/chat/relay.ts);
-- DELETE /away announces an early return and the rooms get what waited. A
-- time away that simply runs out announced nothing, so what waited stayed in
-- the queue until the other side happened to write again — or never (the
-- owner's decision of 2026-09-24: a job at `until`).
--
-- Not one job per step away: jobs_standing (db/020) is unique on kind, the
-- same wall db/043 met. One standing job reads this flag instead: POST /away
-- raises it, DELETE /away lowers it (that return announces itself), and the
-- job lowers it for every time away past its end, announcing each once.
ALTER TABLE identities
  ADD COLUMN IF NOT EXISTS away_wake_due boolean NOT NULL DEFAULT false;

-- Whoever is away while this runs is owed the same wake.
UPDATE identities SET away_wake_due = true WHERE stepped_away_until > now() AND NOT away_wake_due;

-- The job asks every minute; only the few with the flag up are in the index.
CREATE INDEX IF NOT EXISTS identities_away_wake
  ON identities (stepped_away_until) WHERE away_wake_due;
