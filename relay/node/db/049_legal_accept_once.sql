-- One acceptance per identity, document and revision.
--
-- The record answers "which text did they accept, and since when"; a second row
-- of the same revision answers nothing new, and a client repeating the call (or
-- a loop of it) grew the table without bound — forty accepts, forty rows
-- (verifier, 2026-09-24). The first acceptance keeps its time; a repeat is a
-- no-op the route answers 200 to. A new revision is a new row, as before.
--
-- Rows written before this index are folded to their earliest first.
DELETE FROM legal_acceptances a
 USING legal_acceptances b
 WHERE a.identity = b.identity
   AND a.document = b.document
   AND a.revision_sha256 = b.revision_sha256
   AND (a.accepted_at, a.id) > (b.accepted_at, b.id);

CREATE UNIQUE INDEX IF NOT EXISTS legal_acceptances_once
  ON legal_acceptances (identity, document, revision_sha256);
