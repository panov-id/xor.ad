-- An index under the foreign key the yearly prune walks.
--
-- `dsa_statements.notice_id` references `dsa_notices` with ON DELETE SET NULL
-- (db/005), and Postgres does not index a referencing column on its own. Every
-- deleted notice therefore made it scan the statements table to find rows that
-- point at it — during the prune, which deletes a year's worth in one
-- transaction, holding locks the whole way. The same index serves the panel
-- reading a statement by its notice.
CREATE INDEX IF NOT EXISTS dsa_statements_notice ON dsa_statements (notice_id);
