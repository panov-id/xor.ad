-- The storefront a support request came through — the owner's decision of
-- 2026-09-22: the team's daily digest (chat spec §13) goes to each
-- storefront's own support@<domain>, and without the brand the node could not
-- tell whose mailbox a request belongs to. Attribution, like feed_messages.brand:
-- no foreign key, a face can be retired without orphaning rows. NULL — a
-- request sent without a storefront's key.
ALTER TABLE support_requests ADD COLUMN IF NOT EXISTS brand text;
CREATE INDEX IF NOT EXISTS support_by_brand_created ON support_requests (brand, created_at);
