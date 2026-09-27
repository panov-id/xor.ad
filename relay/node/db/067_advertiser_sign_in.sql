-- The advertiser's door (offers/SPEC_RU.md §2.1): a sign-in link by mail and a
-- session cookie on adv.<storefront>.
--
-- An account belongs to one storefront: the cabinet of each lives on its own
-- origin, and the same mailbox on two storefronts is two accounts that never
-- meet. Nullable only for rows written before this migration; the node always
-- sets it.
ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS brand text;
CREATE UNIQUE INDEX IF NOT EXISTS advertisers_brand_email ON advertisers (brand, lower(email));

-- A link is two halves: the token in the letter and a secret left in the
-- browser that asked for it. Only their joint hash is kept, so a letter read by
-- somebody else opens nothing, and a leaked table opens nothing either.
CREATE TABLE IF NOT EXISTS advertiser_links (
  link_hash      text PRIMARY KEY CHECK (link_hash ~ '^[0-9a-f]{64}$'),
  advertiser_id  uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertiser_links_expiry ON advertiser_links (expires_at);

-- A session is a row, not a signed token: signing out and deleting the account
-- end it on the next request.
CREATE TABLE IF NOT EXISTS advertiser_sessions (
  session_hash   text PRIMARY KEY CHECK (session_hash ~ '^[0-9a-f]{64}$'),
  advertiser_id  uuid NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS advertiser_sessions_owner ON advertiser_sessions (advertiser_id);
