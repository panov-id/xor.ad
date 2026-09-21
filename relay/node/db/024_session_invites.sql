-- Moving an identity to another device: what the node holds while it happens.
--
-- The node is deliberately the dumbest party here (chat spec §8.2). It sees a
-- `lookup_id` — half of an Argon2id over nine characters the old device showed
-- on its screen — and two opaque envelopes it cannot open. The other half of
-- that derivation never leaves the devices, so the envelopes are readable only
-- by whoever typed the code. What the node contributes is a rendezvous, a
-- clock, and the rule that this happens once.
--
-- The `lookup_id` is a secret: knowing it is what lets a caller claim an
-- invitation and read its state. That is why the table is keyed by it and why
-- every route takes it in the path rather than deriving it from a session.
CREATE TABLE session_invites (
  -- Stored as the node receives it, like `identities.recovery_auth_hash` is
  -- *not*: that column now holds a hash, because a dump of it was a set of keys
  -- to every identity (2026-09-20). Here a dump is worth two minutes — the
  -- invitation's whole life — and only against invitations in flight at the
  -- moment it was taken. Hashing would also work; it is not done because the
  -- lookup would then cost a hash per poll on a route that is polled.
  lookup_id     text PRIMARY KEY CHECK (char_length(lookup_id) BETWEEN 16 AND 512),
  identity      uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  -- The session that issued it: only it may approve or reject, and it is the
  -- one that goes quiet when the move completes.
  session       uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- 120 seconds (`invite.lifetime` in docs/facts/limits.tsv). Held as a moment rather than a
  -- duration so that expiry is a comparison the database can make.
  expires_at    timestamptz NOT NULL,

  -- Filled by POST /sessions/claim, from the new device. The envelope carries
  -- its two public keys and a label, sealed to the code's other half.
  claimed_at    timestamptz,
  claim_envelope bytea,
  CONSTRAINT session_invites_claim_pair CHECK ((claimed_at IS NULL) = (claim_envelope IS NULL)),

  -- Filled by the old device: approve carries the reply envelope with the long
  -- key, reject carries nothing. `cancelled` is what a second claim leaves —
  -- §8.2, 2026-09-15: somebody who read the code over a shoulder and typed it
  -- first must not silently win, so the *invitation* dies and both sides are
  -- told, rather than the first claim standing.
  decided_at    timestamptz,
  decision      text CHECK (decision IN ('approved', 'rejected', 'cancelled')),
  reply_envelope bytea,
  CONSTRAINT session_invites_decision_pair CHECK ((decided_at IS NULL) = (decision IS NULL)),
  CONSTRAINT session_invites_reply_only_on_approval
    CHECK (reply_envelope IS NULL OR decision = 'approved'),

  -- The session the move created, once it did. Kept so a second approve has
  -- something to be idempotent against rather than making a second session.
  new_session   uuid REFERENCES sessions(id) ON DELETE SET NULL
);

-- One invitation in flight per identity. Two live codes for the same identity
-- would mean two devices racing to become the one live session, and the rule
-- that there is only one is held by an index elsewhere (db/022) — this keeps
-- the race from starting.
CREATE UNIQUE INDEX session_invites_one_live
  ON session_invites (identity)
  WHERE decided_at IS NULL;

-- The sweeper reads by expiry; without this it reads the whole table hourly,
-- and this table's rows are short-lived and many.
CREATE INDEX session_invites_expiry ON session_invites (expires_at)
  WHERE decided_at IS NULL;
