-- A report on an offer's link (offers/SPEC_RU.md §10.1), as the spec writes it:
-- one per person per offer, whether it counts frozen at the moment it is made,
-- and gone with the offer.
CREATE TABLE IF NOT EXISTS offer_link_reports (
  offer_id   uuid NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  reporter   uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  counts     boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, reporter)
);
