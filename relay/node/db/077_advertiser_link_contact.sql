-- The contact travels with the sign-in link that was asked for, and reaches
-- the account only when that link is opened (routes/adv.ts; X2, FX2,
-- 27.09.2026). Before this a sign-up wrote it straight onto the account, and
-- whoever signed up a mailbox first — or last, before the owner opened their
-- letter — set the contact of somebody else's account. Only the one who holds
-- the mailbox opens a link, so only they name the contact.
ALTER TABLE advertiser_links ADD COLUMN IF NOT EXISTS contact text CHECK (contact IS NULL OR char_length(contact) <= 256);
