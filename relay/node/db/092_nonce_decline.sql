-- "Not now" carries a nonce (security panel 07.11.2026, owner /go on the plan's step 4): a signed line lives five
-- minutes, and a decline replayed after its owner took it back declined the person again (routes/matches.ts).
-- The route joins protocol §2's list of routes whose first answer is kept per (session, nonce).
ALTER TABLE nonces DROP CONSTRAINT IF EXISTS nonces_route_check;
ALTER TABLE nonces ADD CONSTRAINT nonces_route_check CHECK (route IN (
  'POST /tables', 'POST /away', 'POST /support', 'POST /recovery/reissue',
  'POST /identities/close', 'POST /vault/pin', 'POST /blocks', 'POST /matches/decline'));
