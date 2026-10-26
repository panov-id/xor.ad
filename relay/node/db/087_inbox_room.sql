-- The chats list's room (chat spec §8.12, protocol §4.4; owner's decision 2026-10-26: «Сразу канал узла»).
-- A person standing on «Chats» used to see a chat the other side opened only on focus or a reload (crowd runs 8-11).
-- Now one socket per session listens, and the node says «the list changed»; the client reads GET /inbox again.
--
-- A ticket for that room names neither a chat nor a table: `inbox` is the third kind.
ALTER TABLE socket_tickets ADD COLUMN IF NOT EXISTS inbox boolean NOT NULL DEFAULT false;
ALTER TABLE socket_tickets DROP CONSTRAINT IF EXISTS socket_tickets_one_room;
ALTER TABLE socket_tickets ADD CONSTRAINT socket_tickets_one_room
  CHECK (num_nonnulls(chat, table_id) + inbox::int = 1);

-- The signal is written by the database, not by each route: a list changes from routes, engines and sweepers alike
-- (likes, offers, a consent, a chat opened, closed or swept, a line waiting), and one forgotten pg_notify is the bug
-- this room exists to end. The payload is the identity only — never what changed; the client asks GET /inbox.
CREATE OR REPLACE FUNCTION inbox_changed_match() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('inbox_changed', mp.identity::text)
     FROM match_participants mp WHERE mp.match_id = COALESCE(NEW.match_id, OLD.match_id);
  -- a cascade from matches has taken the other rows before this AFTER trigger runs: the row going away says it itself
  IF TG_OP = 'DELETE' THEN PERFORM pg_notify('inbox_changed', OLD.identity::text); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION inbox_changed_chat() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('inbox_changed', cp.identity::text)
     FROM chat_participants cp WHERE cp.chat_id = COALESCE(NEW.chat_id, OLD.chat_id);
  -- the row itself, when it is the one going away (a cascade has already taken the others)
  IF TG_OP = 'DELETE' THEN PERFORM pg_notify('inbox_changed', OLD.identity::text); END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION inbox_changed_delivery() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('inbox_changed', s.identity::text) FROM sessions s WHERE s.id = NEW.recipient_session;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS inbox_changed ON match_participants;
CREATE TRIGGER inbox_changed AFTER INSERT OR UPDATE OR DELETE ON match_participants
  FOR EACH ROW EXECUTE FUNCTION inbox_changed_match();
DROP TRIGGER IF EXISTS inbox_changed ON chat_participants;
CREATE TRIGGER inbox_changed AFTER INSERT OR UPDATE OR DELETE ON chat_participants
  FOR EACH ROW EXECUTE FUNCTION inbox_changed_chat();
DROP TRIGGER IF EXISTS inbox_changed ON pending_deliveries;
CREATE TRIGGER inbox_changed AFTER INSERT ON pending_deliveries
  FOR EACH ROW EXECUTE FUNCTION inbox_changed_delivery();

-- A match's own row changes the list too (a take-down or an identity's end moves expires_at; a consent sets chat_id).
CREATE OR REPLACE FUNCTION inbox_changed_match_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('inbox_changed', mp.identity::text) FROM match_participants mp WHERE mp.match_id = NEW.id;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS inbox_changed ON matches;
CREATE TRIGGER inbox_changed AFTER UPDATE OF expires_at, chat_id ON matches
  FOR EACH ROW EXECUTE FUNCTION inbox_changed_match_row();
