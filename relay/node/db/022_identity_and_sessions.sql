-- Step 1 of the build order (chat spec §13): an identity, its sessions, and the
-- three things that hang off them — the node's share of the vault key, what the
-- person accepted, and how they want this face to look.
--
-- Until today the node's schema held control state, keys, quotas and DSA records
-- only: twenty-one migrations, not one product table.
--
-- The DDL below is chat spec §8.2 word for word. Three things it says, §8.2 did
-- not say this morning and says now — the spec was corrected in the same change
-- (2026-09-20), so these are agreements, not departures:
--
--   contrast 'maximum', not 'max'  — docs/accessibility-and-i18n §197 settles the
--       three steps by name (decided 2026-09-15, storefront screen 22), and the
--       API canon spells the enum the same way.
--   six accents, not seven        — the built kit has exactly terra, amber,
--       turquoise, azure, violet, carmine (panel/design/kit/schemes.css:3-14,
--       scripts/design-palettes.py:42, gated green by check-design-palettes).
--       'gold', 'crimson' and 'teal' are token names of the category colours.
--   response measured as text     — §8.2 wrote the nonce body's ceiling as
--       pg_column_size, which is STABLE rather than IMMUTABLE and measures the
--       compressed on-disk form: measured on PostgreSQL 16.13, a 3 009-byte body
--       is refused on insert and reads back as 59, so the ceiling cannot be
--       re-checked by the expression that states it. octet_length is IMMUTABLE
--       and measures the body.
--
-- One real departure, and it is only a name: §8.2 leaves the live-session index
-- anonymous, and an anonymous index refuses a transfer with a message nobody can
-- read. Named here and in §8.2.
--
-- No `IF NOT EXISTS`: tools/migrate_db.ts applies the file and records it in one
-- transaction under an advisory lock (its own comment says the older files carry
-- those guards for a race that no longer exists). A guard here would let an edited
-- file report success against a table of the older shape.
--
-- The seven routes named in nonces.route are protocol §2's seven, verbatim. An
-- eighth has to edit this DDL on purpose — that is the point of the CHECK.

CREATE TABLE identities (
  id                   uuid PRIMARY KEY,
  -- 24 graphemes, counted by the node; the byte ceiling is what SQL can state.
  name                 text NOT NULL CHECK (char_length(name) >= 1 AND octet_length(name) <= 400),
  age                  integer NOT NULL CHECK (age >= 13),  -- no ceiling: decided 2026-08-28
  identity_public_key  text NOT NULL,    -- the long key; proves who this is (§8.13)
  recovery_auth_hash   text,             -- hash of half the paper code: how the node finds the identity
  recovery_wrapped_key bytea,            -- the long key under the other half; the node never opens it
  name_state           text NOT NULL DEFAULT 'accepted'
                         CHECK (name_state IN ('accepted', 'pending', 'rejected')),
  -- A name waiting for the queue's verdict; the previous one stands until then.
  name_pending         text CHECK ((name_state = 'pending') = (name_pending IS NOT NULL)),
  -- Feed languages, up to three. On the node because the node computes the filter.
  languages            text[] NOT NULL DEFAULT '{}' CHECK (cardinality(languages) <= 3),
  -- Clamped into band(age) on write — that part is the node's, it depends on age.
  -- What SQL can hold is the pair's own order, and a reversed pair would otherwise
  -- show an empty feed with no error at all.
  filter_age_min       integer,
  filter_age_max       integer,
  CHECK (filter_age_min IS NULL OR filter_age_max IS NULL OR filter_age_min <= filter_age_max),
  -- End of a time away; until then there is no product for this person. Coming
  -- back early writes now(); a passed deadline is cleared by the session's next
  -- request.
  stepped_away_until   timestamptz,
  -- NULL = the registration never reached the paper code. §8.2 says such an
  -- identity "passes no membership check at all" and is swept after an hour
  -- (signup.unfinished.ttl), and until 2026-09-20 nothing carried that mark:
  -- recovery_auth_hash used to be the accidental one, and since 2026-09-19
  -- recovery_lookup_id arrives in IdentityCreate, so the row is born with it
  -- filled. Membership is signup_completed_at IS NOT NULL AND closed_at IS NULL.
  signup_completed_at  timestamptz,
  -- The one-time right to set a first PIN without the old one, left by an
  -- approved transfer or a recovery claim and spent by POST /vault/init in the
  -- same statement that reads it. Without a carrier the route had no way to tell
  -- a legitimate first PIN from a stolen signing key rewriting auth_hash and
  -- burning the owner's share — the canon promised the refusal and named nothing
  -- to refuse by (2026-09-20, review panel, security lens).
  first_pin_grant_at   timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  closed_at            timestamptz      -- NULL = live
);

-- The sweeper of unfinished signups selects by age among the unfinished only;
-- without the partial index it reads every identity on the node once an hour.
CREATE INDEX identities_unfinished_signup ON identities (created_at)
  WHERE signup_completed_at IS NULL;

-- The public recovery route finds an identity by this hash. Without the index
-- every miss is a full scan, and misses are what that route mostly gets.
CREATE UNIQUE INDEX identities_recovery ON identities (recovery_auth_hash)
  WHERE recovery_auth_hash IS NOT NULL AND closed_at IS NULL;

-- One row per face, not columns on the identity: the identity is one across all
-- faces, and the storefronts' accent sets differ (screen 22).
CREATE TABLE identity_appearance (
  identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  -- The face named by the API key, like feed_messages.brand: attribution, with no
  -- referential integrity on purpose — a face can be retired without orphaning
  -- rows the node would have to explain.
  brand     text NOT NULL,
  theme     text CHECK (theme IN ('light', 'dark', 'system')),   -- NULL = the storefront's default
  contrast  text CHECK (contrast IN ('normal', 'raised', 'maximum')),
  accent    text CHECK (accent IN ('terra', 'amber', 'turquoise', 'azure', 'violet', 'carmine')),
  PRIMARY KEY (identity, brand)
);

-- What the person accepted — a table, not a column: the pair (date, hash) is the
-- record, and a version number is something a human forgets to raise.
CREATE TABLE legal_acceptances (
  id               bigserial PRIMARY KEY,
  identity         uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  document         text NOT NULL CHECK (document IN ('terms', 'privacy', 'guidelines')),
  revision_date    date NOT NULL,        -- the date the document declares about itself
  revision_sha256  text NOT NULL,        -- sha256 of the substance: the file with the date line erased
  accepted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legal_acceptances_latest
  ON legal_acceptances (identity, document, accepted_at DESC);

CREATE TABLE sessions (
  id              uuid PRIMARY KEY,
  identity        uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  sign_public_key text NOT NULL,       -- signs requests; one per device
  wrap_public_key text NOT NULL,       -- wraps chat keys with it (§8.13)
  label           text,                -- "Chrome, Android" — what the device called itself
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- Written at most once a day, so a read does not become a write; the year of
  -- disuse is therefore counted to the day.
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  -- NULL = live; set by a transfer, a closure and the tenth wrong PIN.
  frozen_at       timestamptz,
  frozen_reason   text CHECK (frozen_reason IN ('transfer', 'closed', 'pin_limit')),
  CONSTRAINT sessions_frozen_pair CHECK ((frozen_at IS NULL) = (frozen_reason IS NULL))
);
-- One live session per identity: a transfer freezes the old device, it does not
-- add a second one. Named, because the refusal it raises is read by a person.
CREATE UNIQUE INDEX sessions_one_live
  ON sessions (identity) WHERE frozen_at IS NULL;
-- Every session of an identity, frozen ones included: the partial index above
-- cannot serve the cascade of a real DELETE (§8.2: 30 days after closing), nor
-- "show me my devices". Without it both walk the whole table.
CREATE INDEX sessions_identity ON sessions (identity);

-- One-time actions: the pair (session, nonce) with the first answer, ten minutes
-- (nonce.ttl), shared across the pool. The same nonce on another route is a 409
-- invalid_body — the nonce is bound to its route.
CREATE TABLE nonces (
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  nonce        bytea NOT NULL CHECK (octet_length(nonce) = 16),
  route        text NOT NULL CHECK (route IN (
                 'POST /tables', 'POST /away', 'POST /support', 'POST /recovery/reissue',
                 'POST /identities/close', 'POST /vault/pin', 'POST /blocks')),
  -- Only 2xx and the 409 of state are kept; 400/401/429 are not written.
  status       smallint NOT NULL CHECK (status BETWEEN 200 AND 299 OR status = 409),
  -- The first answer's body only, no headers; a 204's body is 'null'::jsonb.
  response     jsonb NOT NULL CHECK (octet_length(response::text) <= 1024),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, nonce)
);
-- Swept by nonce.ttl, by the same janitor that sweeps conversations. A repeat is
-- looked for only after the signature and the version check — an invalid
-- signature answers 401, never a stored body.
CREATE INDEX nonces_expiry ON nonces (created_at);

-- The node checks the PIN, not the device: handing the share out before the proof
-- would let one theft turn into a million offline guesses.
CREATE TABLE vault_shares (
  session         uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  auth_hash       text NOT NULL,       -- hash of half of material; the PIN itself is unknown here
  -- 32 random bytes UNDER the node's key (db/004_secret_keys.sql), never in the
  -- clear: a dump plus one copied browser profile would otherwise be an offline
  -- PIN search. NULL = burned. If that ever stops being true, this line is the
  -- first one to strike out.
  share_enc       bytea,
  attempts_left   smallint NOT NULL DEFAULT 10 CHECK (attempts_left >= 0),
  -- The node refuses a try before this moment; the delay grows after the fifth.
  next_attempt_at timestamptz,
  locked_at       timestamptz,         -- the tenth miss: entry closed until the paper code, share intact
  burned_at       timestamptz,
  last_used_at    timestamptz NOT NULL DEFAULT now(),
  -- Burning writes NULL and burned_at together, never one of the two.
  CHECK ((burned_at IS NULL) = (share_enc IS NOT NULL))
);
