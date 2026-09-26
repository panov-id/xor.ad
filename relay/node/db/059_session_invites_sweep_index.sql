-- An index the invitation sweep can use (review panel F8, B30, 2026-09-26).
--
-- db/024 promised one ("without this it reads the whole table hourly") and made
-- it partial, WHERE decided_at IS NULL. The sweep (lib/scheduled.ts,
-- prune_session_invites) deletes decided and undecided rows alike by
-- expires_at alone, so the planner could not take it: EXPLAIN on 200 000 rows
-- in postgres:16 showed a Seq Scan with the expiry as a filter. This one has no
-- condition, so the sweep's own WHERE is its whole predicate. db/024's partial
-- index stays: the claim and the one-live rule read the undecided rows.
CREATE INDEX IF NOT EXISTS session_invites_expiry_all ON session_invites (expires_at);
