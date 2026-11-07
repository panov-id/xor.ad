-- Taking "not now" back carries a nonce too (security review 07.11.2026, owner /go): a replayed undo, after its owner
-- declined again, took the new decline back (routes/matches.ts).
ALTER TABLE nonces DROP CONSTRAINT IF EXISTS nonces_route_check;
ALTER TABLE nonces ADD CONSTRAINT nonces_route_check CHECK (route IN (
  'POST /tables', 'POST /away', 'POST /support', 'POST /recovery/reissue',
  'POST /identities/close', 'POST /vault/pin', 'POST /blocks', 'POST /matches/decline', 'DELETE /matches/decline'));
