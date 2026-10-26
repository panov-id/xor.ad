-- «Your turn» (design 25.10 B5, sticker set «at the table»: the bell; owner's /go 2026-10-26). A seated person nudges
-- the one whose turn it is; the nudge reaches that person's chats list room and table room (chat/relay.ts). The node
-- keeps only when the table was last nudged: one nudge a minute per table, on every node at once.
ALTER TABLE tables ADD COLUMN IF NOT EXISTS nudged_at timestamptz;
