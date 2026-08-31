-- A sixth reason: the target lives under another face.
--
-- The snapshot is scoped to the face the notice arrived under, so a complaint
-- filed through one storefront about a person who came through another found
-- nothing — and the code called that `target_gone`, "the phrase expired". It had
-- not: it was alive and one query away. An Article 16 reply is a statement to a
-- person, and that one was untrue.
--
-- Whether the scope itself should change — to what the notifier could see, or to
-- a boundary of its own — is still open (docs/facts/open.tsv:
-- brand.scope.snapshot). This migration does not decide it. It only lets the
-- system stop saying the false thing while it is being decided.

ALTER TABLE dsa_notices
  DROP CONSTRAINT IF EXISTS dsa_notices_snapshot_reason_check;
ALTER TABLE dsa_notices
  ADD CONSTRAINT dsa_notices_snapshot_reason_check
    CHECK (snapshot_reason IS NULL OR snapshot_reason IN
      ('chat_not_stored', 'unknown_kind', 'surface_absent', 'unattributed',
       'out_of_scope', 'lookup_failed'));
