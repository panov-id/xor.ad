-- A table liked without sitting down (chat spec §6.1, the owner's decision of
-- 2026-09-17): a bookmark with a public count, no match and no offer. Who
-- liked never leaves the node; tables.like_count is what goes out. The row is
-- only about the person, so it goes with them (CASCADE, as likes.liker_identity),
-- and with the table when the sweeper deletes it.
CREATE TABLE IF NOT EXISTS table_likes (
  table_id    uuid NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  identity    uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (table_id, identity)
);
CREATE INDEX IF NOT EXISTS table_likes_by_identity ON table_likes (identity);
