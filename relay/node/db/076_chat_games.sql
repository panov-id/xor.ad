-- The game of a chat of two (chat spec §6, the chat_games schema; protocol
-- §4.7; GC1, 27.09.2026). Not the conversation: no line of it is here — only
-- the position, whose turn, the score and an open proposal. It dies with the
-- conversation: by cascade when the chat row goes, and the sweeper takes a
-- game whose chat has ended for either side or whose term has passed.
--
-- `state` holds the two identities in play order (players), which never leave
-- the node: outside, the two are seat 1 and seat 2.
CREATE TABLE IF NOT EXISTS chat_games (
  chat_id        uuid PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  class          text NOT NULL CHECK (class IN ('grid', 'free', 'dots', 'deck', 'dice', 'physics', 'word')),
  set            text NOT NULL,
  state          jsonb NOT NULL,
  score          jsonb NOT NULL DEFAULT '{}'::jsonb,
  seq            integer NOT NULL DEFAULT 0,
  last_move_hash text,
  pending        jsonb,
  over           boolean NOT NULL DEFAULT false,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- The earlier of the two sides' terms (§5: each side has its own); rewritten
  -- on every move, which moves the mover's own term.
  expires_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_games_expiry ON chat_games (expires_at);
