-- §8.13: the ephemeral half is published signed by the long key, so the peer
-- can tell it belongs to the identity they matched with and not to the node.
-- db/030 kept the half; the signature has to travel with it, or the peer has
-- nothing to verify (step 6, 2026-09-22).
ALTER TABLE match_participants ADD COLUMN IF NOT EXISTS ephemeral_signature text;
