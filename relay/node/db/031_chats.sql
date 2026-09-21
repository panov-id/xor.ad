-- Step 5 begins (chat spec §8.6): the chat that a match both sides agreed to
-- becomes. The DDL is the spec's own. Nothing is backfilled — no chat has ever
-- existed — so, as with 030, none of 027's lock-length questions apply.

CREATE TABLE IF NOT EXISTS chats (
  id                uuid PRIMARY KEY,
  pair_key          text NOT NULL UNIQUE,
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
  -- No expires_at: each side has its own, COALESCE(last_own_message_at,
  -- chats.created_at) + its idle_ttl_minutes (§8.6, 2026-09-14).
);

CREATE TABLE IF NOT EXISTS chat_participants (
  chat_id             uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  identity            uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  idle_ttl_minutes    integer NOT NULL DEFAULT 60 CHECK (idle_ttl_minutes IN (10, 30, 60, 260)),
  last_own_message_at timestamptz,
  away_marked         boolean NOT NULL DEFAULT false,
  gone_at             timestamptz,
  PRIMARY KEY (chat_id, identity)
);
CREATE INDEX IF NOT EXISTS chat_participants_by_identity ON chat_participants (identity);

CREATE TABLE IF NOT EXISTS chat_starters (
  chat_id        uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  position       integer NOT NULL,
  text_snapshot  text NOT NULL,   -- a copy: the feed expires, the chat's header does not
  mode           text NOT NULL CHECK (mode IN ('alone', 'company', 'party')),
  liked_by       uuid NOT NULL,   -- internal; never sent out as it is
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, position)
);

-- The key 030 promised: matches.chat_id could not reference a table that did
-- not exist. SET NULL, because a chat outlives neither its match's row nor the
-- other way round by design — the match is swept when it expires unagreed, and
-- once agreed it is the chat that matters.
ALTER TABLE matches
  ADD CONSTRAINT matches_chat_id_fkey FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL;
