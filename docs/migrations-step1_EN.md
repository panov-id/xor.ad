# Step 1 migrations: identity and session

The chat spec (`chat_EN.md` §8.2) describes step 1's three tables in three
different sections, interleaved with the reasoning. Here they are gathered in the
shape they will reach the database in: **what, in which order, and what proves
it**.

Written on 2026-08-28, before the first line of code, for the same reason the test
map was written first: there will be no argument about what counts as done,
because the list is derived from the spec rather than from whatever turned out to
be convenient.

## How the mechanism works, and what follows from it

The node's migrations are files at `relay/node/db/NNN_name.sql`, applied **in name
order, once each**, with the fact recorded in `schema_migrations`. The tool is
`relay/node/tools/migrate_db.ts`, and it is **deliberately dumb**: no rollback, no
checksums, no DSL.

Two rules for step 1 follow, and neither is a matter of taste:

- **Forward only.** A mistake in an applied migration is fixed by the next
  migration, not by editing the file: the file is already recorded by name and
  will not run again.
- **A file reads as the schema.** Since `db/` *is* the description of the schema, a
  comment in a migration is worth exactly as much as the column beside it.

Today `db/` holds thirteen files, `001`–`010` and `012`–`014`: control state, quotas, brand and API
keys, the node's secret keys, the register of Article 16 notices. Not one product
table — step 1 opens the first.

## The order

It was not chosen; it follows from the foreign keys: a session references an
identity, a share references a session.

```
011_identities.sql     →   015_sessions.sql     →   016_vault_shares.sql
                       →   017_legal_acceptances.sql
   the identity              the device               the vault key's share
```

**The numbers jump, and it is not a typo (fixed 2026-09-02).** The plan was
written on 2026-08-28, when 011–014 were free. While it sat there, a neighbouring
subsystem took 012, 013 and 014 for its DSA Article 16 migrations, and the plan
quietly pointed at occupied names: `migrate_db.ts` is deliberately dumb, sorts by
name and does not catch a collision — only the deploy itself would have. The
identity keeps 011, the rest moves to 015–017. The chat schema is 018.

**Three files rather than one.** A single migration for three tables would read as
"the identity and everything stuck to it", while these are different things with
different fates: a session goes still on transfer, a share burns after ten wrong
PINs, an identity lives on. The split costs one extra file and saves an
investigation six months from now.

## 017 — what a person accepted

```sql
CREATE TABLE legal_acceptances (
  id               bigserial PRIMARY KEY,
  identity         uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  document         text NOT NULL CHECK (document IN ('terms', 'privacy', 'guidelines')),
  revision_date    date NOT NULL,
  revision_sha256  text NOT NULL CHECK (char_length(revision_sha256) = 64),
  accepted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX legal_acceptances_latest ON legal_acceptances (identity, document, accepted_at DESC);
```

- **Added 2026-08-29 — until then the acceptance existed only in words.** Both
  the registration screen and the spec claimed the accepted revision is stored
  next to the identity; there was nothing to store, because the documents
  carried a single "last updated" line typed by hand. Now the pair is a date and
  the `sha256` of the text's substance, and a storefront check
  (`deploy/check-legal-revisions.py`) keeps the two from drifting apart.
- **The reference cascades.** When an identity is erased its acceptances go with
  it: this is data about a person, not about a document, and it has no business
  outliving them.
- **The index on (identity, document, time) descending** — the only frequent
  query here is "what does this identity have accepted now", which takes the
  first row of the group.
- **A `CHECK` on the hash length**, because the one plausible write error is a
  truncated or empty hash, discovered in a dispute.

## 011 — the identity

```sql
CREATE TABLE identities (
  id               uuid PRIMARY KEY,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 24),
  age              integer NOT NULL CHECK (age >= 13),
  identity_public_key text NOT NULL,
  recovery_auth_hash  text,
  recovery_wrapped_key bytea,
  name_state       text NOT NULL DEFAULT 'accepted',  -- accepted | pending | rejected
  created_at       timestamptz NOT NULL DEFAULT now(),
  closed_at        timestamptz
);

CREATE UNIQUE INDEX identities_recovery ON identities (recovery_auth_hash)
  WHERE recovery_auth_hash IS NOT NULL AND closed_at IS NULL;
```

- **The public half of the key is all the node keeps.** No secret and no hash of
  one: a leaked database does not let anyone impersonate people.
- **The recovery columns are nullable**, even though since 2026-08-26 they are
  always filled at registration. The nullability is left deliberately, so as not
  to rewrite the schema for a field that is filled anyway.
- **The partial unique index** exists because this hash is what the public
  recovery endpoint searches by: two codes pointing at two rows would be resolved
  silently, taking the first, and misses are the bulk of that traffic.
- **`name_state`** carries the rule "while a name is rejected, no match opens".

Closes test-map claims **1.1–1.6** (an identity is created, name and age are
mandatory, before the first post the name is visible to nobody).

## 015 — the session

```sql
CREATE TABLE sessions (
  id              uuid PRIMARY KEY,
  identity        uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE,
  sign_public_key text NOT NULL,
  wrap_public_key text NOT NULL,
  label           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  frozen_at       timestamptz
);

CREATE UNIQUE INDEX ON sessions (identity) WHERE frozen_at IS NULL;
```

**The partial unique index is the one-live-session rule.** A second live one is
refused by the database, and no code path can go around it — which is precisely
why the rule lives here rather than in an application check.

Closes: **2.1–2.5** (request signing), **4.1–4.10** (moving an identity: the old
device goes still, the new one has its own key pair).

## 016 — the vault key's share

```sql
CREATE TABLE vault_shares (
  session       uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  auth_hash     text NOT NULL,
  share_enc     bytea NOT NULL,
  attempts_left smallint NOT NULL DEFAULT 10,
  burned_at     timestamptz,
  last_used_at  timestamptz NOT NULL DEFAULT now()
);
```

- **The share is stored encrypted under the node's key**
  (`004_secret_keys.sql`), not as it is. Otherwise a database dump plus one copied
  browser profile gives an offline search over a million PINs, and the whole
  design collapses in exactly the way the spec calls unacceptable.
- **The share belongs to a device, not to an identity**: otherwise whoever took
  the identity and set their own PIN would read someone else's old conversations.
- **Burning writes `share_enc = NULL`**, not only a date: otherwise the bytes stay
  lying there.

Closes: **3.1–3.6** (the PIN, the share, ten attempts), **5.1–5.8** (recovery from
the paper code).

## What step 1 does not include — an order, not an oversight

`feed_messages`, `likes`, `identity_stats`, `matches`, `match_participants`,
`chats`, `chat_participants`, `chat_starters`, `blocks`, `hidden_messages`,
`chat_key_wraps` — eleven tables belonging to steps 2 through 7. Their DDL is
already written in the spec and moves here as the steps come. Starting with them
is impossible by §13: without an identity there is no feed, without a feed no
like, without a like no match.

## How a migration is shown to have done what it promised

Not by eye, and not by "it applied without errors":

1. `deno run ... tools/migrate_db.ts --dry-run` — the list of what would be
   applied.
2. Apply, then `SELECT name FROM schema_migrations` — the file is recorded.
3. **Negative checks**, which are the test map's rows: an `INSERT` with a
   25-character name fails on the `CHECK`; a second live session for the same
   identity fails on the unique index; deleting an identity takes its sessions and
   shares with it by cascade.
4. A test that has been **seen red**: break the `CHECK`, watch it fail, restore. A
   green migration whose failure nobody has seen proves nothing.

## Open

- ~~`age` has no `CHECK`~~ — **closed 2026-08-28**: `CHECK (age >= 13)` is in the DDL,
  and **there is no upper bound in it** — somebody may have lived a long time, and an
  invented ceiling cuts off a living person to catch a typo. It was not an open question but a divergence: screen 2 of the
  storefronts already stated that this constraint exists in the database, and
  explained the refusal to a twelve-year-old by it — while the spec's DDL had none.
  The screen won, because behind it stand the decision of 2026-08-26 and the text a
  person actually reads.
- **`name_state` is text, not an `enum`.** Three values are listed in a comment;
  the database does not check them.
- **The node's key for `share_enc`** comes from `004_secret_keys.sql`; how its
  rotation relates to the shares is described nowhere, and losing that key equals
  losing every local history at once.
