-- The foreign key db/034 promised: hidden_messages.table_line_id waited for
-- table_lines (db/064). CASCADE, as feed_message_id's: a hidden line goes with
-- its table when the sweeper deletes it (§6.1, DATA-8), and the row means
-- nothing without the line.
DO $$ BEGIN
  ALTER TABLE hidden_messages ADD CONSTRAINT hidden_messages_table_line_id_fkey
    FOREIGN KEY (table_line_id) REFERENCES table_lines(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS hidden_messages_table_line ON hidden_messages (table_line_id)
  WHERE table_line_id IS NOT NULL;
