-- Step 8: tables — a game for a company, next to the feed (chat spec §6.1,
-- protocol §4.6). The DDL is the spec's, column for column; what differs is
-- said where it differs.
--
-- Not here: table_likes. Liking a table is its own route pair and its own
-- task; the column like_count is here so the table's shape does not change
-- when it comes.

CREATE TABLE IF NOT EXISTS tables (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand            text NOT NULL,                             -- attribution only, as a phrase's
  game             text NOT NULL CHECK (game IN ('grid', 'free', 'dots', 'deck', 'dice', 'physics', 'word')),
  set              text NOT NULL,
  seats            smallint NOT NULL CHECK (seats BETWEEN 2 AND 6),
  name             text CHECK (octet_length(name) <= 256),
  name_pending     text CHECK (octet_length(name_pending) <= 256),
  like_count       integer NOT NULL DEFAULT 0,
  lat              double precision NOT NULL,
  lon              double precision NOT NULL,
  area_radius      integer NOT NULL CHECK (area_radius IN (100, 300, 1000, 3000, 10000)),
  created_by       uuid REFERENCES identities(id) ON DELETE SET NULL,  -- never in any answer
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_move_at     timestamptz NOT NULL DEFAULT now(),        -- the sliding term, one for all
  closed_at        timestamptz                                -- set by leave_table when the last one stands up
);
CREATE INDEX IF NOT EXISTS tables_sliding ON tables (last_move_at) WHERE closed_at IS NULL;
-- The sweeper deletes closed tables too; without this it would scan for them.
CREATE INDEX IF NOT EXISTS tables_closed ON tables (closed_at) WHERE closed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS table_seats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id         uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  identity         uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  joined_at        timestamptz NOT NULL DEFAULT now(),        -- lines are shown from here on, never earlier
  playing_from     timestamptz,                               -- NULL: seated and talking, not playing
  left_at          timestamptz,
  seat_no          smallint NOT NULL,                         -- max+1 under the table's lock, never reused
  UNIQUE (table_id, seat_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS table_seats_one_at_a_time ON table_seats (identity) WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS table_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand            text NOT NULL,
  table_id         uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  author_identity  uuid REFERENCES identities(id) ON DELETE SET NULL,
  text             text CHECK (char_length(text) >= 1 AND octet_length(text) <= 2048),
  sticker          text,
  seat_no          smallint NOT NULL,
  kind             text NOT NULL DEFAULT 'line'
                     CHECK (kind IN ('line', 'application', 'refusal', 'move', 'sticker', 'congratulation')),
  CONSTRAINT table_lines_text_or_sticker CHECK ((kind = 'sticker') = (sticker IS NOT NULL) AND (kind = 'sticker' OR text IS NOT NULL)),
  created_at       timestamptz NOT NULL DEFAULT now(),
  visible_at       timestamptz                                -- NULL: waits for the moderation queue
);
CREATE INDEX IF NOT EXISTS table_lines_feed ON table_lines (table_id, created_at) WHERE visible_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS table_lines_queue ON table_lines (created_at) WHERE visible_at IS NULL;
CREATE INDEX IF NOT EXISTS table_lines_queue_by_author ON table_lines (author_identity) WHERE visible_at IS NULL;

CREATE TABLE IF NOT EXISTS table_games (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id       uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  class          text NOT NULL,
  state          jsonb NOT NULL,
  seq            integer NOT NULL DEFAULT 0,
  last_move_hash text,
  pending        jsonb,
  turn_due       timestamptz,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS table_games_current ON table_games (table_id) WHERE ended_at IS NULL;
-- The autopass job picks overdue turns; the spec names the column, not the index.
CREATE INDEX IF NOT EXISTS table_games_due ON table_games (turn_due) WHERE ended_at IS NULL AND turn_due IS NOT NULL;

CREATE TABLE IF NOT EXISTS table_scores (
  seat_id      uuid PRIMARY KEY REFERENCES table_seats(id) ON DELETE CASCADE,
  points       integer NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
