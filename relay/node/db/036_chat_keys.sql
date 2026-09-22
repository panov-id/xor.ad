-- §8.13: the ephemeral halves belong to the conversation, not to the match that
-- opened it. They were read through matches.chat_id, and a match gone — swept,
-- or replaced by a later re-match of the pair — took the halves with it while
-- the chat lived on (step-6 panel, 2026-09-22). Copied here when the chat
-- opens; ON DELETE CASCADE on chat_participants already takes them with the chat.
ALTER TABLE chat_participants
  ADD COLUMN IF NOT EXISTS match_id             uuid,
  ADD COLUMN IF NOT EXISTS ephemeral_public_key text,
  ADD COLUMN IF NOT EXISTS ephemeral_signature  text;
