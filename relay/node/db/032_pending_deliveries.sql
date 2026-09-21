-- The only place a chat message exists on the node, and only until it is
-- delivered (chat spec §8.8: there is no `messages` table and no history).
-- A ciphertext the node cannot read, keyed by the sender's local_id so a
-- repeat makes no duplicate. The DDL is the spec's own.

CREATE TABLE IF NOT EXISTS pending_deliveries (
  chat              uuid NOT NULL REFERENCES chats(id)    ON DELETE CASCADE,
  recipient_session uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  local_id          uuid NOT NULL,
  ciphertext        bytea NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chat, recipient_session, local_id)
);
CREATE INDEX IF NOT EXISTS pending_deliveries_by_session ON pending_deliveries (recipient_session, created_at);
