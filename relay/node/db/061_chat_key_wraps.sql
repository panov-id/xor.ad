-- Step 6 (chat spec §8.13): the conversation's keys wrapped under the live
-- session's wrap key, kept by the node as opaque bytes so a client that stores
-- keys between launches — the web face, after a reload — opens the chat again
-- without keeping the ephemeral half in memory. The DDL is the spec's own
-- (chat_RU.md, CREATE TABLE chat_key_wraps), plus the epoch: since 2026-09-22 a
-- conversation's keys change on a reissue, and a wrap of the old ones must be
-- told apart from one of the new (chat_participants.key_epoch, db/031).
--
-- ON DELETE CASCADE carries meaning, not hygiene (§8.13): the chat gone, its
-- wraps are gone; the session deleted, its wraps with it. One live session per
-- identity (db/022 sessions_one_live), so one wrap per participant; a frozen
-- session keeps its row and gets no new ones — that is what makes a freeze real.
-- The node never reads wrapped_key: it stores it and hands it back to the
-- session that wrote it, and to nobody else (routes/chats.ts, lib/chat_keys.ts).
-- The bound on its length is the transport's: two AES-256 direction keys under
-- an ECDH-derived AES-GCM key with the wrapping half in front come to about
-- 200 bytes (depth/core/seal.ts); 768 leaves room and refuses a payload that is
-- not a wrap.
--
-- Nothing is backfilled: no wrap has ever existed.
CREATE TABLE IF NOT EXISTS chat_key_wraps (
  chat_id      uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  key_epoch    integer NOT NULL DEFAULT 0,
  wrapped_key  bytea NOT NULL CHECK (octet_length(wrapped_key) BETWEEN 1 AND 768),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, session_id)
);
-- The cascade from sessions and "every wrap of this device" need the second
-- column on its own; the primary key serves only the chat.
CREATE INDEX IF NOT EXISTS chat_key_wraps_session ON chat_key_wraps (session_id);
