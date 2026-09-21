-- What a person hid for themselves (chat spec §8.9, screens 5 and 10). The
-- author never learns: the row is the viewer's, and only the viewer's feed
-- leaves the phrase out.
--
-- One departure from the spec's DDL, said here: table_line_id has no foreign
-- key, because table_lines does not exist yet. The migration that creates tables
-- adds it; until then nothing writes the column, and the CHECK still holds that
-- exactly one of the two is set.

CREATE TABLE IF NOT EXISTS hidden_messages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),  -- the opaque handle of DELETE /hidden/:id (DATA-17)
  identity         uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  feed_message_id  uuid REFERENCES feed_messages(id) ON DELETE CASCADE,
  table_line_id    uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(feed_message_id, table_line_id) = 1),
  UNIQUE (identity, feed_message_id),
  UNIQUE (identity, table_line_id)
);
