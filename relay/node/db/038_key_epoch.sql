-- §8.13, the key reissued after a device change: each side's half has an
-- epoch. 0 is the half from consent; a side that lost its pair publishes a
-- half at the next epoch, the other side answers at the same one, and the
-- conversation's keys are those of the epoch both hold (step 6, 2026-09-22).
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS key_epoch integer NOT NULL DEFAULT 0;
