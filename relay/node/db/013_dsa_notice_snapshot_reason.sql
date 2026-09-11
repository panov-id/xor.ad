-- Why the copy was not taken, next to the fact that it was not.
--
-- (Since db/014 there are six; this file describes the five it introduced.)
-- `snapshot_state` says what happened to the copy: received, target_gone,
-- not_accessible. Five different situations arrive at the third — a chat that is
-- never stored, a kind with no snapshot rule, a surface not built yet, a notice
-- with no tenant to scope the lookup to, and a lookup that broke — and the
-- answer to the notifier is the same in all five. What to fix is not: the first
-- is by design, the third waits for the product, and the fifth is a defect
-- shipping silently. Until this column, the night's review had nothing to sort
-- them by, and a broken query looked exactly like a chat.
--
-- Null is the normal state: it means the status already says everything, which
-- is the case whenever a copy was taken or the target was gone.

ALTER TABLE dsa_notices
  ADD COLUMN IF NOT EXISTS snapshot_reason text;

ALTER TABLE dsa_notices
  DROP CONSTRAINT IF EXISTS dsa_notices_snapshot_reason_check;
ALTER TABLE dsa_notices
  ADD CONSTRAINT dsa_notices_snapshot_reason_check
    CHECK (snapshot_reason IS NULL OR snapshot_reason IN
      ('chat_not_stored', 'unknown_kind', 'surface_absent', 'unattributed', 'lookup_failed'));

-- A reason without "we could not look" would be a contradiction: the column
-- explains that one outcome and nothing else.
ALTER TABLE dsa_notices
  DROP CONSTRAINT IF EXISTS dsa_notices_snapshot_reason_scope;
ALTER TABLE dsa_notices
  ADD CONSTRAINT dsa_notices_snapshot_reason_scope
    CHECK (snapshot_reason IS NULL OR snapshot_state = 'not_accessible');

COMMENT ON COLUMN dsa_notices.snapshot_reason IS
  'Which of the five situations led to not_accessible. Must stay equal to '
  'CaptureReason in src/lib/dsa_snapshot.ts.';
