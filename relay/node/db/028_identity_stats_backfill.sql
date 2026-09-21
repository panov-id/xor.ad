-- Every identity gets its counters row, including the ones that arrived before
-- there was a table to put it in.
--
-- db/025 created identity_stats and left the filling to registration
-- (routes/identity.ts), which is right for new identities and says nothing
-- about old ones. Any identity registered between db/022 and db/025 has no
-- row, and lib/feed_limits.ts answered a missing row with "four live phrases
-- already" — a permanent ban on publishing, delivered in the words of a
-- temporary ceiling, with nothing in the log. No contour has such identities
-- today (measured 2026-09-21: origin/dev is behind both migrations), which is
-- exactly why this is cheap to do now.
--
-- The route defends itself too, with INSERT … ON CONFLICT DO NOTHING before it
-- reads. Two defences rather than one, because they fail differently: this
-- migration cannot help an identity created after it runs, and the route
-- cannot help a reader that is not the route.
INSERT INTO identity_stats (identity)
SELECT id FROM identities
ON CONFLICT DO NOTHING;
