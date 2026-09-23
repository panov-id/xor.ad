-- The night path's ceiling (owner, 23.09.2026): every new notice is copied to
-- the personal addresses at once, but only the first few in an hour; the rest
-- go as one summary after the hour. One row per hour, shared by every node of
-- the pool — a ceiling kept in one process would be one per node.
CREATE TABLE IF NOT EXISTS night_path_hours (
  hour                 timestamptz PRIMARY KEY,
  sent                 int NOT NULL DEFAULT 0,
  summarized_at        timestamptz,
  summary_leased_until timestamptz
);
