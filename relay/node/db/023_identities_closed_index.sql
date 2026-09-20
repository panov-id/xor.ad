-- Two passes of the identity sweeper read this table on a schedule, and neither
-- had an index to read it by.
--
-- The deletion pass asks for identities closed more than thirty days ago; the
-- catch-up pass asks for every closed identity with something left undone
-- (lib/identity_sweeper.ts). Both were sequential scans of the whole table,
-- hourly, for ever — found by the data lens of the review panel on 2026-09-20.
--
-- Partial on purpose, and the selectivity runs the right way for once: closed
-- identities are the few. The other pass of the sweeper — "no session seen for
-- a year" — gets no index here and is not meant to: its condition matches
-- almost every row, and an index over almost every row is read more slowly than
-- the table. That cost is named rather than hidden, in the sweeper's own
-- comment.
CREATE INDEX IF NOT EXISTS identities_closed
  ON identities (closed_at)
  WHERE closed_at IS NOT NULL;
