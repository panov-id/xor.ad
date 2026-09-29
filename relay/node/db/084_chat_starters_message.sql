-- Which phrase a starter was copied from (N1c, 30.09.2026). A decision under
-- Article 16 empties the starters of the phrase it took down, and it has to
-- find them by the phrase's id: the phrase itself is often gone by then — its
-- author took it down, or it expired and was swept — and matching by "liked
-- by the other side" would also empty that side's later starters (extra
-- likes, §8.7). No foreign key: the id outlives the phrase, as
-- match_participants.message_id does (db/030). NULL for starters written
-- before this and for an offer's starter, which has no phrase.
ALTER TABLE chat_starters ADD COLUMN IF NOT EXISTS message_id uuid;
CREATE INDEX IF NOT EXISTS chat_starters_by_message ON chat_starters (message_id) WHERE message_id IS NOT NULL;
