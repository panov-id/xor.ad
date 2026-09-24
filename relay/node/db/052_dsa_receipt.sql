-- A receipt for a notice without a mailbox (dsa/SPEC §6, decided 2026-09-14).
--
-- The device that files a notice makes a random 128-bit code and keeps it; the
-- node keeps only its SHA-256 here, next to the notice and never next to an
-- identity. POST /report/decision answers by the code. The hash leaves with the
-- notice a year on (prune_dsa_records deletes the row).
ALTER TABLE dsa_notices
  ADD COLUMN IF NOT EXISTS receipt_hash text CHECK (receipt_hash IS NULL OR receipt_hash ~ '^[0-9a-f]{64}$');

CREATE INDEX IF NOT EXISTS dsa_notices_receipt
  ON dsa_notices (receipt_hash) WHERE receipt_hash IS NOT NULL;
