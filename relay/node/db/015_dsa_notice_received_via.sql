-- Who examines a notice, now that the copy is bounded by what the notifier saw.
--
-- The boundary was decided 2026-09-07 (docs/chat: "Граница снимка — по видимости
-- для заявителя"): on the feed and at tables the world is one, so the copy is
-- taken by the target rather than by the storefront the notice arrived through.
-- That answered what may be copied and left open who may read it, and the two
-- are not the same question. A review panel the same day showed why: `brand` on
-- a notice is chosen by whoever sends it — from their own key, or from a `source`
-- hint in the body — and the moderator's queue is filtered by that same column.
-- Left alone, a tenant could file notices against identifiers belonging to
-- another tenant and read the copies in their own panel, one row at a time.
--
-- So a notice whose copy turns out to belong to another face is not examined by
-- the face it was filed through. It goes to the platform queue — `brand IS NULL`
-- — which 007 already created for notices that arrive with no face at all.
--
-- The face it did arrive through is not thrown away: it is what an Article 16
-- reply is addressed from, and losing it would make the reply unattributable.
-- It moves to a column of its own, which is attribution and never a filter.
ALTER TABLE dsa_notices
  ADD COLUMN IF NOT EXISTS received_via text;

COMMENT ON COLUMN dsa_notices.received_via IS
  'The face the notice arrived through. Attribution only: the queue is filtered '
  'by brand, never by this. Set when the copy belongs to another face and the '
  'notice was therefore routed to the platform (brand IS NULL).';

-- Reading the platform queue is not solved here. Until someone opens it, these
-- notices are answered — Article 16(4) acknowledgement goes out at intake — but
-- examined by nobody, and that is a smaller wrong than examined by a competitor.
-- Tracked as an open item: dsa.platform.queue.unread.
COMMENT ON COLUMN dsa_notices.brand IS
  'The tenant whose moderators examine this notice. NULL means the platform: '
  'either the notice arrived with no usable key (007), or its copy belongs to a '
  'face other than the one it was filed through (2026-09-07). Never taken from '
  'the sender when those two disagree.';
