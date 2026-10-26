-- Chat spec §6.2 (owner's decision, 2026-10-25): playing alone while you wait.
-- The owner said neighbours should see it: a table carries "playing alone"
-- from the moment its seated person opens a puzzle until they close it or a
-- round starts. The node keeps only that moment — never the puzzle, its
-- position or a score: those stay on the device.
ALTER TABLE tables ADD COLUMN IF NOT EXISTS solo_since timestamptz;
