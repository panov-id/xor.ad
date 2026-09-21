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
-- already-rounded latitude, poles folded onto their meridian. Authority is the
-- TypeScript: if the two ever disagree, the TypeScript is right and this file
-- is history.
UPDATE feed_messages SET
  lat_published = round(lat / (area_radius / 111320.0)) * (area_radius / 111320.0),
  lon_published = CASE
    WHEN abs(cos(radians(round(lat / (area_radius / 111320.0)) * (area_radius / 111320.0)))) < 1e-9
      THEN 0
    ELSE round(
           lon / (area_radius / (111320.0 * cos(radians(
             round(lat / (area_radius / 111320.0)) * (area_radius / 111320.0)))))
         ) * (area_radius / (111320.0 * cos(radians(
             round(lat / (area_radius / 111320.0)) * (area_radius / 111320.0)))))
  END
WHERE lat_published IS NULL;

ALTER TABLE feed_messages
  ALTER COLUMN lat_published SET NOT NULL,
  ALTER COLUMN lon_published SET NOT NULL;

-- The box the delivery narrows with reads the published pair now, so the index
-- follows it. The old one stays until the next migration proves nothing needs
-- it: dropping an index and finding out in production is the wrong order.
CREATE INDEX feed_live_geo_published
  ON feed_messages (lat_published, lon_published)
  WHERE visible_at IS NOT NULL;
