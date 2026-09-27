-- When a moderator last decided anything for a face (lib/moderation_watch.ts).
--
-- The watchdog asked the feed alone: a phrase published since the queue
-- stopped. A refusal deletes its row and left nothing to ask, and a decision
-- at a table — a line or a name, published or refused — was not in the feed at
-- all, so a moderator deciding only tables read as stopped. One row per face,
-- moved forward by every decision in the panel's queues. The audit trail keeps
-- who; this keeps only when, and only the latest.
CREATE TABLE moderation_verdicts (
  brand       text PRIMARY KEY,
  decided_at  timestamptz NOT NULL
);
