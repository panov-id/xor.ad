-- "I saw it": marks on a live lost (owner, 30.10.2026; docs/newdesign4/
-- LOST_SPOTS §2, §5), and complaints that take a lost down by count (§4).
--
-- A mark is where and when, in words, from a signed-in neighbour. There are
-- no coordinates: the product never asks a device for its location (owner's
-- policy), so "where" is a line a person typed, judged by the model as a
-- phrase is (moderator kind seen_note), and "when" is one of four steps —
-- now, a quarter of an hour, an hour, earlier. A finer time would be a
-- measurement; a step is enough to look.
--
-- The author of the lost reads the marks whole; everybody else sees that
-- marks exist and how old they are, never who or where (routes/lost.ts). A
-- mark goes with its lost (CASCADE) and loses its author when the account is
-- erased (SET NULL), as a phrase does. Marks older than three days are
-- "dim" — computed from created_at at read time, not stored, so nothing has
-- to sweep them.
CREATE TABLE IF NOT EXISTS lost_seen_marks (
  id               uuid PRIMARY KEY,
  lost_id          uuid NOT NULL REFERENCES feed_messages(id) ON DELETE CASCADE,
  author_identity  uuid REFERENCES identities(id) ON DELETE SET NULL,
  -- Where, in words. 140 graphemes counted on the node; the byte ceiling is
  -- the wide net SQL can state (as db/025 for a phrase).
  where_text       text NOT NULL CHECK (char_length(where_text) >= 1 AND octet_length(where_text) <= 1024),
  when_step        text NOT NULL CHECK (when_step IN ('now', '15m', '1h', 'earlier')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lost_seen_marks_lost ON lost_seen_marks (lost_id, created_at);

-- A complaint about a lost: "take it down", counted as an offer's complaints
-- are (db/071, routes/offer_complaints.ts). One person counts once per lost
-- (the primary key); whether it counts is frozen at the moment it is made.
-- Three counting complaints from different people end the lost at once
-- (routes/lost.ts: expires_at = now()). The row stays as the record of why.
CREATE TABLE IF NOT EXISTS lost_complaints (
  lost_id     uuid NOT NULL REFERENCES feed_messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  counts      boolean NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lost_id, user_id)
);
