-- The first-tier moderator's hint for a queued phrase (lib/moderator.ts, E2).
--
-- The model reads a phrase the rules sent to the person's queue and says
-- publish, reject or unsure; the person decides. One hint per phrase, gone
-- with the phrase. `ms` is how long the model took, for the measurement.
CREATE TABLE IF NOT EXISTS moderator_hints (
  feed_message_id uuid PRIMARY KEY REFERENCES feed_messages (id) ON DELETE CASCADE,
  verdict         text NOT NULL CHECK (verdict IN ('publish', 'reject', 'unsure')),
  reason          text NOT NULL DEFAULT '',
  model           text NOT NULL,
  ms              integer NOT NULL CHECK (ms >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);
