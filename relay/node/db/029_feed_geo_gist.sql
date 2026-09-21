-- An index for the case that costs, and the removal of one that costs nothing
-- and takes room.
--
-- Measured 2026-09-21 on a million phrases (scripts/measure-feed-geo.sh, the
-- numbers are in docs/reviews/PANEL_2026-09-21_steps1-2.md):
--
--   dense spot, BETWEEN  →  Index Scan using feed_cursor, 8.2 ms
--   dense spot, <@ box   →  Bitmap + top-N sort,         76.2 ms
--   sparse edge, BETWEEN →  the whole million discarded, 468.8 ms, nothing found
--   sparse edge, <@ box  →  Bitmap over the box,          63.3 ms
--
-- So there is no single best index here, and that is the finding. Where phrases
-- are dense the planner ignores geometry entirely: `feed_cursor` already orders
-- by `visible_at DESC`, which is the query's own order, and thirty rows are
-- found almost at once. Where they are sparse that same walk reads every row in
-- the table and returns nothing — and routes/feed.ts runs it up to five times
-- as it grows the radius, so telling somebody their neighbourhood is empty cost
-- about two seconds.
--
-- The route asks the first, common question with BETWEEN and the expansion
-- attempts with `<@ box`, which by construction only happen after an empty
-- answer. This index serves the second form.
CREATE INDEX feed_live_geo_box
  ON feed_messages USING gist (point(lon_published, lat_published))
  WHERE visible_at IS NOT NULL;

-- And the one nothing uses. db/025 built `feed_live_geo` on (lat, lon); db/027
-- moved every geo predicate to the published pair and kept the old index
-- "until the next migration proves nothing needs it". The measurement is that
-- proof: it appears in neither plan above, and it costs 37 MB per million rows.
DROP INDEX IF EXISTS feed_live_geo;
