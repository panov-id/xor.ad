-- Let the database hold the kind the route already accepts.
--
-- `table_line` was added to the DSA specification on 2026-08-28 and to the set
-- the route accepts on 2026-08-30 (acc7cbb, "Accept a notice about a table
-- line"). The CHECK in 005 was never widened with it. So a notice about a line
-- at a table passed the route's own check, reached the INSERT, and died there:
-- measured against a migrated database, `feed_message`, `offer`, `chat` and
-- `other` answer 202 and `table_line` answers 503 "could not store the notice"
-- — because lib/db.ts swallows the PostgresError and returns null. The person
-- reporting illegal content got a failure where Article 16(4) requires a
-- receipt, and nothing anywhere went red: no test in the database suite sends
-- this kind.
--
-- Editing 005 in place would have been useless: tools/migrate_db.ts skips a file
-- whose name is already in schema_migrations, so a database that has run 005
-- would never see the change.
--
-- The constraint is dropped and recreated rather than widened in place because
-- Postgres has no ALTER ... CHECK; the name is the one Postgres generated for
-- 005, confirmed on a throwaway database.

ALTER TABLE dsa_notices
  DROP CONSTRAINT IF EXISTS dsa_notices_target_kind_check;

ALTER TABLE dsa_notices
  ADD CONSTRAINT dsa_notices_target_kind_check
    CHECK (target_kind IN ('feed_message', 'offer', 'table_line', 'chat', 'other'));

COMMENT ON COLUMN dsa_notices.target_kind IS
  'What the notice is about. Must stay equal to KINDS in src/routes/report.ts, '
  'which the specification defines; dsa_kinds.test.ts holds all three together.';
