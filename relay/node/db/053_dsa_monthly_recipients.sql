-- Article 24(3) DSA: the average monthly active recipients over six months,
-- given to the coordinator or the Commission on request (dsa.art24-3).
--
-- Only the count is kept — a month and a number, no identity, no address. The
-- node has no country for a person, so every active identity counts as in the
-- Union: an estimate from above, written as the method (decided by quorum
-- 2026-09-24, five of five). A month's row is raised by a daily pass and never
-- lowered, so a missed last day of the month loses nothing.
CREATE TABLE IF NOT EXISTS dsa_monthly_recipients (
  month     date PRIMARY KEY CHECK (extract(day FROM month) = 1),
  active    integer NOT NULL CHECK (active >= 0),
  taken_at  timestamptz NOT NULL DEFAULT now()
);
