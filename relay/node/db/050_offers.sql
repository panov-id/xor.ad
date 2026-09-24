-- Offers of venues: the three tables of offers/SPEC_RU.md §3, as written there.
--
-- The first slice is the link (§6.2): /o/<code> shows the full domain and /go
-- counts a hit and sends a person on. The cabinet, the envelope and the
-- complaints come later; their tables (offer_complaints, offer_link_reports,
-- business_responses) with them.
--
-- The DDL is the spec's own; what is added is only what the spec states in
-- words: the three statuses, a code that names one offer, and the lookup by it.
-- No IF NOT EXISTS: a table of that name already there is somebody's probe or a
-- half-made migration, and taking it silently would leave the CHECKs off
-- (verifier, 2026-09-24; the same reasoning as db/022).
CREATE TABLE advertisers (
  id                  uuid PRIMARY KEY,
  email               text NOT NULL,           -- sign-in by magic link
  email_confirmed_at  timestamptz,             -- no envelope and no offer before it
  contact             text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venues (
  id                   uuid PRIMARY KEY,
  advertiser_id        uuid NOT NULL REFERENCES advertisers(id),
  name                 text NOT NULL,
  address              text NOT NULL,           -- the envelope goes here
  verification_status  text NOT NULL
    CHECK (verification_status IN ('unverified', 'verified', 'suspended')),
  verified_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offers (
  id                      uuid PRIMARY KEY,
  brand                   text NOT NULL,          -- every search is bounded by it
  venue_id                uuid NOT NULL REFERENCES venues(id),
  offer_text              text NOT NULL,
  discount_value          text NOT NULL,
  conditions              text CHECK (conditions IS NULL OR char_length(conditions) <= 128),
  promo_code              text,
  external_url            text,                   -- never shown to people, §6.2
  redirect_code           text NOT NULL,
  redirect_disabled_at    timestamptz,            -- the link is off, the offer stays
  redirect_hits           integer NOT NULL DEFAULT 0,
  last_checked_at         timestamptz,
  repeated_from_offer_id  uuid REFERENCES offers(id),
  discount_until          timestamptz NOT NULL,   -- the discount's term, not the card's
  status                  text NOT NULL CHECK (status IN ('active', 'expired', 'hidden')),
  published_at            timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL    -- the card's life in the feed (4:20)
);

-- /o/<code> finds one offer by it; two offers under one code would send a
-- person to whichever the planner met first.
CREATE UNIQUE INDEX offers_redirect_code ON offers (redirect_code);
CREATE INDEX venues_advertiser ON venues (advertiser_id);
