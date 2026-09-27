-- A socket ticket for a table (protocol §4.6 POST /tables/:id/ticket, §4.4):
-- the same one-time ticket a chat's room spends, for the table's room. A
-- ticket opens exactly one of the two, so `chat` loses NOT NULL and the pair
-- is held by a CHECK. The table's ticket goes with the table (the sweeper
-- deletes it, §6.1).
ALTER TABLE socket_tickets ALTER COLUMN chat DROP NOT NULL;
ALTER TABLE socket_tickets ADD COLUMN IF NOT EXISTS table_id uuid REFERENCES tables(id) ON DELETE CASCADE;
DO $$ BEGIN
  ALTER TABLE socket_tickets ADD CONSTRAINT socket_tickets_one_room CHECK (num_nonnulls(chat, table_id) = 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
