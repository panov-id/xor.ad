-- What outlives a notice (dsa/SPEC §9): after a year the notice goes, and a
-- count stays — how many notices there were in a month, by kind of target. No
-- receipt hash, no brand, no people: enough to answer "is this growing?", not
-- enough to find anyone. tools/prune_dsa_records.ts adds to it in the same
-- statement that deletes, so a notice is either still a row or already counted.
CREATE TABLE IF NOT EXISTS dsa_notice_counts (
  month       date NOT NULL,
  target_kind text NOT NULL,
  notices     int  NOT NULL CHECK (notices > 0),
  PRIMARY KEY (month, target_kind)
);
