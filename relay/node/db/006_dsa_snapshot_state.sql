-- Split two meanings that were sharing one column.
--
-- 005 let `status` hold both where a notice stands in its life — received,
-- in_review, upheld, rejected — and whether a copy of the reported content could
-- be taken: target_gone, not_accessible. The queue a moderator works from is
--
--   WHERE status IN ('received', 'in_review')
--
-- so a notice whose snapshot failed never reached the queue at all. It is not an
-- edge case. A report about a chat is always 'not_accessible' by construction
-- (dsa_snapshot.ts returns it without looking), and 'target_gone' is what a feed
-- message becomes within hours of being posted, which is most of them. Those
-- notices arrived, were acknowledged under Article 16(4), and then waited in a
-- queue nobody could see — while Article 16 obliges us to examine each one and
-- answer with reasons.
--
-- Found on 2026-08-09 by filing a notice about a feed_message on staging and not
-- finding it in the panel. The earlier end-to-end check had used target_kind
-- 'other' with no id, which leaves the status at 'received' — so it passed, and
-- proved less than it looked.

ALTER TABLE dsa_notices
  ADD COLUMN IF NOT EXISTS snapshot_state text NOT NULL DEFAULT 'received'
    CHECK (snapshot_state IN ('received', 'target_gone', 'not_accessible'));

COMMENT ON COLUMN dsa_notices.snapshot_state IS
  'Whether a copy of the reported content could be taken when the notice arrived. '
  'Not a lifecycle state: a notice with no copy still has to be examined.';

-- Move what was written into the wrong column. Anything else keeps its status.
UPDATE dsa_notices
   SET snapshot_state = status,
       status = 'received'
 WHERE status IN ('target_gone', 'not_accessible');

-- With the snapshot outcome gone, `status` means exactly one thing again, and the
-- queue index below it becomes what its name always claimed.
ALTER TABLE dsa_notices DROP CONSTRAINT IF EXISTS dsa_notices_status_check;
ALTER TABLE dsa_notices ADD CONSTRAINT dsa_notices_status_check
  CHECK (status IN ('received', 'in_review', 'upheld', 'rejected'));
