-- Hits of the limits kept by address, so a node that starts again keeps them
-- (lib/rate_limit.ts; roadmap §1: the counters lived in memory and a new
-- container started every address from nought).
--
-- One row per counted hit: the bucket as the limiter names it — the limit, a
-- colon, the address's bucket (IPv4 dotted, IPv6 by /64) and any suffix — and
-- when. The limiter still decides in memory; this is what it reads back on
-- start. The longest window is a day, so a row older than that is swept.
-- Limits kept by identity or by mailbox are not written: protocol §5 keeps
-- them in memory on purpose.
CREATE TABLE rate_limit_hits (
  bucket  text NOT NULL CHECK (octet_length(bucket) <= 512),
  at      timestamptz NOT NULL
);
CREATE INDEX rate_limit_hits_at ON rate_limit_hits (at);
