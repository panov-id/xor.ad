-- The coordinates the feed actually compares against, stored next to the exact
-- ones it must never hand out.
--
-- §8.3 rounds a phrase's centre to a grid whose step is the phrase's own radius
-- before publishing it, so that everybody who published inside one cell hands
-- out the same point. That held for the answer and not for the query: the
-- delivery measured the circle intersection against `lat`/`lon`, the exact
-- pair, while the caller supplies the other centre and the other radius as
-- query parameters at full double precision. The boundary of "is this phrase
-- in my circle" was therefore a circle of known radius around the *exact*
-- centre, and a viewer could walk the boundary by bisection — two passes on
-- latitude, one on longitude — and read the exact centre off it to within
-- metres, of a phrase published on a 100 m grid. Found by the security lens of
-- the review panel, 2026-09-21, and confirmed by the refuter against these
-- lines.
--
-- Rounding the query instead of the answer would have been the naive fix: the
-- step depends on each row's own radius, so it would have meant the grid
-- arithmetic inside a SELECT, which lib/feed_geo.ts warns against by name
-- (take the cosine from the unrounded latitude and the longitude step becomes a
-- function of the value the rounding exists to hide).
--
-- So the published point is computed once, by the same function that publishes
-- it, and stored. The delivery compares against these columns, which means
-- everything a bisection can recover is a value the answer already carried.
--
-- The exact pair stays: it is what the author sent, and the next radius a
-- phrase is republished at would round to a different cell.

ALTER TABLE feed_messages
  ADD COLUMN lat_published double precision,
  ADD COLUMN lon_published double precision;

-- The one-time backfill, and the only place this arithmetic is written in SQL.
-- It is the same grid as lib/feed_geo.ts `quantise`, cosine taken from the
-- already-rounded latitude, poles folded onto their meridian. "The same" means
-- the same cell every time, and the same latitude bit for bit; the longitude
-- can differ in its last bit, because it passes through cos(), and PostgreSQL's
-- cos() and V8's Math.cos are different implementations. No formula removes
-- that, and the first two versions of this comment claimed otherwise.
--
-- It matters less than it sounds: on every contour this migration reaches,
-- feed_messages is empty when it runs (025 is deployed nowhere yet), so the
-- statement below touches no rows. It stays correct for the case where it
-- would.
--
-- Two differences, both measured by the review panel's data lens on
-- 2026-09-21 against the TypeScript on 20 040 points:
--
--   `round(double)` in PostgreSQL rounds halves to even (rint): round(2.5) = 2.
--   JavaScript's `Math.round` rounds halves up. At an exact half the two picked
--   neighbouring cells — up to ten kilometres apart at the widest radius. The
--   formula below uses floor(x + 0.5), which is Math.round.
--
--   `area_radius / 111320.0` with an integer radius is computed in numeric and
--   converted afterwards; the TypeScript divides doubles. Longitudes differed
--   in the last bits in 15% of points. The radius is cast to float8 first.
--
-- relay/node/test/feed_publish.test.ts runs this very statement, read out of
-- this file, against `quantise` — half-points included — so the promise is
-- checked, not stated. Its first run is what found the cos() difference.
UPDATE feed_messages SET
  lat_published = floor(lat / (area_radius::float8 / 111320) + 0.5)
                  * (area_radius::float8 / 111320),
  lon_published = CASE
    WHEN abs(cos(radians(floor(lat / (area_radius::float8 / 111320) + 0.5)
                         * (area_radius::float8 / 111320)))) < 1e-9
      THEN 0
    ELSE floor(
           lon / (area_radius::float8 / (111320 * cos(radians(
             floor(lat / (area_radius::float8 / 111320) + 0.5)
             * (area_radius::float8 / 111320))))) + 0.5
         ) * (area_radius::float8 / (111320 * cos(radians(
             floor(lat / (area_radius::float8 / 111320) + 0.5)
             * (area_radius::float8 / 111320)))))
  END
WHERE lat_published IS NULL;

-- **No NOT NULL here, and that is the deploy, not an oversight.** The wizard
-- runs migrations in the new image while the old node is still serving
-- (relay/wizard/wizard.py: migrate, then `up -d`). The old node's INSERT does
-- not know these columns; made NOT NULL in this file, every phrase published
-- during that window failed — and after a rollback of the image, every phrase
-- failed for good, with no schema rollback to undo it. Found by the operations
-- and data lenses of the review panel, 2026-09-21.
--
-- So this release only adds the columns (expand). The new code always writes
-- them. NOT NULL comes in a later migration, in a later release, once no node
-- running the old code remains (contract) — and that migration must start by
-- re-running the backfill above for rows the old node wrote during this
-- window, or it will fail on them. Recorded as open item P5 in open-work.

-- The box the delivery narrows with reads the published pair now, so the index
-- follows it. The old one stays until the next migration proves nothing needs
-- it: dropping an index and finding out in production is the wrong order.
CREATE INDEX feed_live_geo_published
  ON feed_messages (lat_published, lon_published)
  WHERE visible_at IS NOT NULL;
