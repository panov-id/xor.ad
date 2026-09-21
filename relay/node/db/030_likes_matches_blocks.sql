-- The last four tables of the first cut (chat spec §13): likes, matches,
-- match_participants, blocks. Steps 1 and 2 did not need them; the like route
-- of step 3 does, because a like reads blocks (§8.9) and a mutual like writes a
-- match (§8.5). The DDL is the spec's own — docs/chat_RU.md §8.4, §8.5, §8.9 —
-- and where it had to differ, the difference is said here.
--
-- New and empty, so none of the lock-length questions of 027 apply: nothing is
-- backfilled and no running node reads these yet.

-- §8.4. The primary key is the double tap: a second like of the same phrase by
-- the same person is ON CONFLICT DO NOTHING, and the counters move only on a
-- real insert.
CREATE TABLE IF NOT EXISTS likes (
  liker_identity   uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  feed_message_id  uuid NOT NULL REFERENCES feed_messages(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (liker_identity, feed_message_id)
);
-- The match query of §8.5 walks from a phrase to the likes on it.
CREATE INDEX IF NOT EXISTS likes_by_message ON likes (feed_message_id);

-- §8.5. `chat_id` has no foreign key yet, and this is the one departure from
-- the spec: it references `chats`, which is step 5 and does not exist. The key
-- is added by the migration that creates `chats`; until then nothing writes
-- the column, because nothing can open a chat.
CREATE TABLE IF NOT EXISTS matches (
  id          uuid PRIMARY KEY,
  pair_key    text NOT NULL UNIQUE,     -- sha256(min(a,b) || ':' || max(a,b))
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,     -- the earlier of the two phrases
  chat_id     uuid
);

CREATE TABLE IF NOT EXISTS match_participants (
  match_id             uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  identity             uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  -- No foreign key on purpose: the row keeps the snapshot below after the
  -- phrase is gone, which is what a match is shown by. Nothing sweeps expired
  -- matches yet; that sweep, when written, takes both (review panel, 2026-09-21).
  message_id           uuid NOT NULL,
  text_snapshot        text NOT NULL,  -- the phrase as it was at the match
  mode                 text NOT NULL CHECK (mode IN ('alone', 'company', 'party')),
  accepted_at          timestamptz,    -- NULL: has not pressed "open the chat"
  declined_at          timestamptz,    -- "not now", seen only by its own side
  ephemeral_public_key text,           -- this side's ephemeral half, signed (§8.13)
  PRIMARY KEY (match_id, identity)
);
CREATE INDEX IF NOT EXISTS match_participants_by_identity ON match_participants (identity);

-- §8.9. Written per identity; the check is symmetric, one row either way.
CREATE TABLE IF NOT EXISTS blocks (
  blocker_identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  blocked_identity  uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- The opaque handle for GET /blocks and DELETE /blocks/:id: it does not lead
  -- back to the identity (DATA-21, 2026-09-16).
  id                uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  PRIMARY KEY (blocker_identity, blocked_identity)
);
CREATE INDEX IF NOT EXISTS blocks_by_blocked ON blocks (blocked_identity);
