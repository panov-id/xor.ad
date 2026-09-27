-- Whom a refusal refuses (chat spec §6.1: "a refused applicant waits for the
-- next round, not this one"). A refusal is an ordinary line, but without its
-- target the round could not tell which applicant it kept out. The seat, not
-- the identity: seats are what goes out, and are never reused in a table's
-- life (SEC-16). NULL on every other kind.
ALTER TABLE table_lines ADD COLUMN IF NOT EXISTS refuses_seat smallint;
DO $$ BEGIN
  ALTER TABLE table_lines ADD CONSTRAINT table_lines_refusal_target
    CHECK ((kind = 'refusal') = (refuses_seat IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
