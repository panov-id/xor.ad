-- The ephemeral half of a match belongs to the session that published it.
--
-- A move of the identity before the second press froze the old session and
-- left its half standing; the private half stayed on the old device, and the
-- chat that opened with it opened with a key nobody could derive (open.tsv
-- chat.queue.epk-session; chat spec §8.2, the owner's decision of 2026-09-18).
-- The consent writes its session here; freezing that session takes back the
-- half and the consent while the match has no chat (lib/sessions.ts), and the
-- new device consents with a half of its own. A chat already open is left to
-- its rekey (§8.13).
--
-- Nullable, no default: an old node writes no session and its halves stay as
-- they were; a half without one is simply not taken back by a freeze.
ALTER TABLE match_participants
  ADD COLUMN IF NOT EXISTS ephemeral_session uuid REFERENCES sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS match_participants_ephemeral_session
  ON match_participants (ephemeral_session) WHERE ephemeral_session IS NOT NULL;
