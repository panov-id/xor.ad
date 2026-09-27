-- Where a venue's offers are shown (offers/SPEC_RU.md §7: "the zone of a
-- business offer is its venue's address"). The feed asks by circles, and a
-- venue had its address only as words, so no offer of the cabinet ever reached
-- anybody's feed (found by xor-ad-2c, 27.09.2026). The point is the venue's
-- own, given by the cabinet with the address — no geocoder, nothing outside —
-- and the radius takes the same five steps as a phrase's. Nullable: a venue
-- made before this has no point and its offers wait for one.
ALTER TABLE venues
  ADD COLUMN lat double precision CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  ADD COLUMN lon double precision CHECK (lon IS NULL OR lon BETWEEN -180 AND 180),
  ADD COLUMN area_radius integer CHECK (area_radius IS NULL OR area_radius IN (100, 300, 1000, 3000, 10000)),
  ADD CONSTRAINT venues_place_whole CHECK ((lat IS NULL) = (lon IS NULL) AND (lat IS NULL) = (area_radius IS NULL));

-- The feed's question: live offers of a brand, by the venue's box.
CREATE INDEX offers_live_by_brand ON offers (brand, expires_at) WHERE status = 'active';
