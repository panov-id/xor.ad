-- The match of an offer is one-sided (chat spec §8.5, "the match of an offer
-- is born one-sided"): a like on a phrase with a discount makes the match at
-- once, and the one who came to the offer has no phrase of their own. The DDL
-- is the spec's own: the two columns that described that phrase may be NULL
-- for that row. mode stays NOT NULL and carries the offer's mode on both rows —
-- the chat's header (chat_starters.mode, db/031) reads it and has no NULL to
-- give. Nothing is backfilled: no such row exists before this migration.
ALTER TABLE match_participants
  ALTER COLUMN message_id    DROP NOT NULL,   -- NULL for the one who came to the offer
  ALTER COLUMN text_snapshot DROP NOT NULL;
