-- The pending sweeper deletes by age (lib/pending_sweeper.ts, every minute);
-- without this it walked the whole table each time (step-5 panel, 2026-09-21).
CREATE INDEX IF NOT EXISTS pending_deliveries_by_age ON pending_deliveries (created_at);
