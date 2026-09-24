-- One acceptance per revision, and a revision is its date as well as its text.
--
-- db/049 keyed the acceptance on the text's sha256 alone. A document re-dated
-- without a change of text is served under a new date; its acceptance wrote
-- nothing, and the record kept answering the old date — while the record
-- exists to answer "which revision did they accept" (verifier, 2026-09-24).
-- The date joins the key; rows already there are all distinct under it.
DROP INDEX IF EXISTS legal_acceptances_once;
CREATE UNIQUE INDEX legal_acceptances_once_dated
  ON legal_acceptances (identity, document, revision_date, revision_sha256);
