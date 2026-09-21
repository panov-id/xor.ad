-- One-time tickets for the chat's socket (protocol §4.4, limits.tsv
-- ticket.lifetime = 30 s). In the database rather than in a node's memory: the
-- pool has more than one node, and the node that issues a ticket need not be the
-- one the socket reaches. Only the hash is kept, as with every other token here.
-- Not declared in the spec's DDL; the place is a technical choice, named in the
-- commit that made it (2026-09-21).

CREATE TABLE IF NOT EXISTS socket_tickets (
  token_hash  text PRIMARY KEY,
  session     uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  chat        uuid NOT NULL REFERENCES chats(id)    ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS socket_tickets_by_expiry ON socket_tickets (expires_at);
