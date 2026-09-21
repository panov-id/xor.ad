-- Step 2 of the build order: the feed, and the counters the feed's limits stand
-- on (chat spec §8.3).
--
-- What is here is the writing side — a phrase arrives, waits for a verdict, and
-- becomes visible or does not. The reading side (the circle intersection, the
-- age bands, the cursor) uses these same rows and the indexes below; the
-- moderation queue's own worker is its own thing again.
--
-- Two decisions in this file are load-bearing and easy to undo by accident, so
-- they are written here rather than only in the spec.

CREATE TABLE feed_messages (
  id               uuid PRIMARY KEY,
  -- Attribution only: which face the author arrived through. It takes part in
  -- **no** condition of the feed's delivery, of a like or of a match — the
  -- world is one (§8). The column carried the opposite comment until
  -- 2026-08-21, and a migration copied from the DDL rather than from a
  -- paragraph four hundred lines above is exactly how that would have become
  -- true.
  brand            text NOT NULL,
  -- Never goes outside. NULL means the author was erased, which is why an
  -- établissement's offer does not live in this table: a row with no author
  -- would be indistinguishable from an erased neighbour (§8.3, 2026-09-02).
  author_identity  uuid REFERENCES identities(id) ON DELETE SET NULL,
  -- 128 graphemes, counted on the node. The byte ceiling is the wide net the
  -- database can state — and, as with a name, it is a second real limit rather
  -- than the same one in other units (§8.3; the name's pair is db/022).
  text             text NOT NULL CHECK (char_length(text) >= 1 AND octet_length(text) <= 2048),
  mode             text NOT NULL CHECK (mode IN ('alone', 'company', 'party')),
  -- Decided by the node at publication, and what the feed's language filter
  -- reads (2026-09-16, DATA-22).
  lang             text NOT NULL,
  -- The centre of the area the author chose — not where they are. What goes
  -- outside is this rounded to a grid whose step is the radius (§8.3): the
  -- rounding is not against "where is he" but against gluing one author's
  -- phrases together by an exact repeated centre.
  lat              double precision NOT NULL,
  lon              double precision NOT NULL,
  -- Five steps, not a free integer: 9901 possible values would be a near-unique
  -- label by themselves, which is half of the same hole the rounding closes.
  area_radius      integer NOT NULL CHECK (area_radius IN (100, 300, 1000, 3000, 10000)),
  like_count       integer NOT NULL DEFAULT 0,
  -- A neighbour's offer is a phrase with a discount, not a separate thing.
  discount_value   text,
  conditions       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- NULL = waiting for the moderation queue. Both are written by one UPDATE at
  -- the verdict: `expires_at` was NOT NULL and derived from `visible_at` at the
  -- same time, which cannot both be true on insert — and a generated column was
  -- refused by Postgres because the expression is not IMMUTABLE (checked in a
  -- container, §8.3).
  visible_at       timestamptz,
  expires_at       timestamptz,
  CONSTRAINT feed_published CHECK ((visible_at IS NULL) = (expires_at IS NULL))
);

CREATE INDEX feed_expiry ON feed_messages (expires_at) WHERE visible_at IS NOT NULL;
-- The feed's cursor is `(visible_at, id) < (:va, :id)` (2026-09-16, DATA-5).
CREATE INDEX feed_cursor ON feed_messages (visible_at DESC, id DESC) WHERE visible_at IS NOT NULL;
CREATE INDEX feed_live_geo ON feed_messages (lat, lon) WHERE visible_at IS NOT NULL;
-- "One at a time" and "four an hour" at send time read by author.
CREATE INDEX feed_by_author ON feed_messages (author_identity) WHERE author_identity IS NOT NULL;
-- **"One phrase at a time" is held by this index, not by a count.** A second
-- waiting insert raises 23505 rather than racing a SELECT that looked empty a
-- moment ago (checked in postgres:16, 2026-09-14). A refused row is deleted,
-- which is what frees the slot.
CREATE UNIQUE INDEX feed_one_waiting ON feed_messages (author_identity) WHERE visible_at IS NULL;

-- The counters an identity carries, created in the registration transaction and
-- not by the first like: the publication limits of §8.3 stand on this row, and a
-- conditional UPDATE against a row that does not exist refuses silently for ever
-- (experiment in postgres:16).
CREATE TABLE identity_stats (
  identity           uuid PRIMARY KEY REFERENCES identities(id) ON DELETE CASCADE,
  likes_received     integer NOT NULL DEFAULT 0,
  likes_given        integer NOT NULL DEFAULT 0,
  matches            integer NOT NULL DEFAULT 0,
  chats_opened       integer NOT NULL DEFAULT 0,
  -- **Moments, not a number — 2026-09-14 (D4, D5, S7).** A single integer
  -- cannot "drop out" after an hour, and once phrases began to be DELETEd — a
  -- take-down, a step-away — "four an hour" had nothing left to count from.
  -- The arrays are cleaned on write and cut to the last six and four; the
  -- length is held by the writing expression rather than by a CHECK, because a
  -- constraint here would make the verdict write fail.
  rejected_at_recent  timestamptz[] NOT NULL DEFAULT '{}',
  published_at_recent timestamptz[] NOT NULL DEFAULT '{}',
  -- Written at the first `visible_at`, as a UTC date. It serves one rule only:
  -- "the reporter has been publishing for a while" (offers spec §10.1).
  first_published_at  date,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
