-- Watchdog С1's ceiling, per hour and per address, as C2's is per hour.
--
-- The ceiling counted letters per pass. A pass comes back in ten minutes after
-- any letter that did not leave, so one failing address kept the passes at
-- ten minutes and each brought the healthy address up to six letters and a
-- summary about newly aged notices — 42 an hour again, only about different
-- notices (verifier, 2026-09-24). Here the hour's letters are counted: six one
-- by one and one summary per address in an hour; what is over waits for the
-- next hour with its stamp given back. The address is its SHA-256; rows older
-- than two days are cleared by the pass itself.
CREATE TABLE IF NOT EXISTS dsa_aging_hours (
  hour          timestamptz NOT NULL,
  address_hash  text NOT NULL CHECK (address_hash ~ '^[0-9a-f]{64}$'),
  letters       integer NOT NULL DEFAULT 0,
  summaries     integer NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, address_hash)
);
