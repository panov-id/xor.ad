-- W17-EN (owner's decision, 2026-10-05): the platform prints the envelope —
-- the venue's address and its code straight on a DL envelope, in English —
-- and marks it sent. Once sent, the panel no longer shows the code: the code
-- leaves the screens it no longer needs, and the row keeps when it went.
-- Nothing else changes: the code is still readable until used or burnt (068),
-- for the case where the post loses it and the platform must print it again
-- from the database by hand.
ALTER TABLE venue_envelopes ADD COLUMN IF NOT EXISTS sent_at timestamptz;
