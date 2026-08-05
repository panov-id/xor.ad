-- Article 16 DSA: anyone may notify us that content is illegal, and we owe them
-- a confirmation, an examination and a reasoned answer. Article 17: whoever's
-- content we restrict is owed the reasons. Neither obligation depends on our
-- size, so neither can wait for the product to grow into it.
--
-- The hard part is not the table but the snapshot. A feed message lives four
-- hours and twenty minutes and is then deleted, so by the time a notice is
-- examined the thing it is about is usually gone. Keeping every message "in case
-- someone complains" would trade the whole ephemerality of the product for a
-- rare event; keeping nothing would mean answering notices blind. So a copy is
-- taken at the moment a notice arrives, and only then — see docs/dsa/README.

CREATE TABLE IF NOT EXISTS dsa_notices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand         text NOT NULL,

  -- What is being reported. target_id is the message/offer identifier when the
  -- notice came from a card, and NULL when someone wrote to us in free form.
  target_kind   text NOT NULL CHECK (target_kind IN ('feed_message', 'offer', 'chat', 'other')),
  target_id     text,

  -- The copy taken on arrival. NULL means the content had already expired — an
  -- answer is still owed, but there was nothing left to examine or to restrict.
  snapshot      jsonb,

  -- Article 16(2)(a): a substantiated explanation. An empty notice creates no
  -- actual knowledge under 16(3) and gives nothing to examine, so it is required.
  reason_text   text NOT NULL CHECK (length(btrim(reason_text)) > 0),

  -- Article 16(2)(c): name and email, except where the report concerns the
  -- sexual abuse of children — then we must not ask, hence nullable.
  notifier_name  text,
  notifier_email text,

  -- Article 16(2)(d): the good-faith statement. Stored rather than assumed,
  -- because it is the notifier's own declaration and may be quoted back.
  bona_fide     boolean NOT NULL DEFAULT false CHECK (bona_fide),

  status        text NOT NULL DEFAULT 'received'
                CHECK (status IN ('received', 'in_review', 'upheld', 'rejected',
                                  'target_gone', 'not_accessible')),

  -- Article 16(6): if automated means took part, the answer must say so. Here a
  -- human decides notices; automation only ever screened the publication.
  automated_used boolean NOT NULL DEFAULT false,

  created_at      timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  decided_at      timestamptz
);

-- The queue a moderator works from: oldest undecided first.
CREATE INDEX IF NOT EXISTS dsa_notices_queue
  ON dsa_notices (status, created_at)
  WHERE status IN ('received', 'in_review');

-- Retention runs by age, so the sweep gets its own index rather than a scan.
CREATE INDEX IF NOT EXISTS dsa_notices_age ON dsa_notices (created_at);

CREATE TABLE IF NOT EXISTS dsa_statements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand         text NOT NULL,

  -- NULL when we restricted something on our own initiative rather than on a
  -- notice. Article 17 is owed either way.
  notice_id     uuid REFERENCES dsa_notices(id) ON DELETE SET NULL,

  target_id           text NOT NULL,
  recipient_identity  text NOT NULL,

  restriction   text NOT NULL
                CHECK (restriction IN ('removed', 'hidden', 'offer_taken_down',
                                       'access_restricted')),

  facts         text NOT NULL,

  -- Article 17(3)(d) and (e): illegal content cites a rule, a breach of the
  -- Terms cites a clause. Which of the two is not optional information.
  ground_kind   text NOT NULL CHECK (ground_kind IN ('legal', 'contractual')),
  ground_text   text NOT NULL,

  automated_used boolean NOT NULL DEFAULT false,

  -- NULL until the author has actually been told. A statement written and never
  -- delivered discharges nothing.
  delivered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dsa_statements_recipient
  ON dsa_statements (recipient_identity, created_at);

CREATE INDEX IF NOT EXISTS dsa_statements_age ON dsa_statements (created_at);

-- The notifier's identity is never shown to the author. That is stricter than
-- Article 17(3)(b), which permits disclosure where strictly necessary, and it
-- matches the rule the offers spec already sets for complaints. Enforced in the
-- application rather than here, but stated here so the next reader of the schema
-- does not join these two tables and hand the name over by accident.
