# A plan for what is open — 2026-09-08

The registry `docs/facts/open.tsv` holds 20 items and answers "what is open". It
deliberately does not answer "in what order" — and without that answer the list
reads as a flat wall where an obligation already running sits beside the app's
light theme. This document puts them in order and names the price; the items
themselves live in the registry, only the sequence and the reasoning are here.

The order is not by importance but **by what goes off first**. An item that
breaks nothing today and becomes unfixable after launch ranks above one that is
unpleasant now and will stay exactly as unpleasant.

## Queue 1 — obligations whose clock is running

**`dsa.article18.route` — the only item due "now".** The recipient has been found
and written into the spec (`docs/dsa/SPEC_EN.md`), the route and the button were
built and rolled to dev on 2026-09-08. One thing is left and it cannot be
programmed: **confirm the address by contacting them**. A first real Article 18
report is a bad moment to find out the mailbox was wrong. This is a person's
action, not code's.

Price: a letter or a call to the Cybercrime Subdivision. The item closes after
that.

## Queue 2 — what could only be fixed before launch · closed 2026-09-08

Three items that threatened nothing precisely because there is no product, and
would have become defects with data in them the day the product tables appeared.
All three are done.

- **`probe.drops.feed.table`** — probes ask the database before building their
  own surface: `refuseIfSurfaceExists` fails with a legible message if the table
  is already the real one. Five calls guarding four `DROP TABLE`s.
- **`jobs.lease.unchecked`** — `relay/node/db/020_jobs_lease.sql`: a partial
  unique index `jobs_standing` (tombstones excluded) and a `lease` column.
  `finish` names the lease both when deleting and when rescheduling.
- **`idempotency.unbounded`** — `relay/node/db/021_idempotency_age.sql` adds the
  index on `created_at`, the scheduler a daily sweep (`PRUNE_IDEMPOTENCY`).

Each is closed by a probe, and each probe was watched go red: a broken age
condition and a broken lease check fail their own probes. The lease probe was
rewritten to get there — it wrote its own SQL, bypassing `finish`, and stayed
green with the code broken.

## Queue 3 — what is exposed today

Closed in full on 2026-09-08.

- ~~**`auth.link.unlimited`**~~ — `/auth/request-link` now has two ceilings, and
  they are not interchangeable. On the caller's address (`SIGN_IN_LIMITS`) it may
  say 429 out loud: that reveals no membership. On the mailbox being asked for
  (`SIGN_IN_MAILBOX_LIMITS`, six an hour) it stays 204, because a 429 there would
  confirm the address is worth limiting — and the person being flooded is not the
  one asking. The mailbox is hashed: the limiter's keys live in memory as plain
  strings. Unclicked links are swept by their own `exp` with an hour's grace
  (`pruneMagicLinks`) — the general object prune cannot take them, it works by
  age and refuses windows shorter than a week.
- ~~**`v1.no.address.limit`**~~ — `V1_LIMITS` is checked inside `authenticate`,
  before the key is resolved: a flood of unauthorized attempts is refused without
  a key lookup each. In memory, so it works exactly when the daily quota switches
  itself off over an unreachable database.
- ~~**`metrics.public`**~~ — `/metrics` is served against `METRICS_TOKEN`, and
  404 without a valid one (not 401: a 401 would confirm the path was right). Not
  filtered by address: everything arrives through Caddy on the same box, so the
  connection's address is identical for a scraper and for the whole internet. The
  token is set nowhere, so it is closed to everybody — and step 3 of the runbook
  was rewritten along with it.
- ~~**`mailer.body.logged`**~~ — the log line carries the provider's machine
  readable fault (`name`), not five hundred characters of body: Resend quotes the
  request back, so one mistyped recipient put somebody's address into a log
  storage keeps for a year. Exceptions that reach a log go through
  `withoutAddresses`.

## Queue 4 — what goes off at three in the morning

- ~~**`firewall.reset.window`**~~ — the rules go to the box as a script, run
  detached from the ssh session (`setsid nohup`), with `ufw --force enable` on a
  `trap` so it runs even when a rule is rejected. There were two holes rather
  than one: losing the connection mid-chain, and the `&&` that ended the chain at
  the first mistyped whitelist address — both left a public box with no firewall,
  silently. The wizard now reads `ufw status` afterwards and fails if it did not
  come back up.
- **`backups.same.zone`** — the code is ready: `BACKUP_STORAGE_ZONE`/`KEY` are
  read by the backup script and by the restore drill alike (a drill looking in
  the old zone would report a broken backup rather than a stale drill), and
  without them the script says so every night. Creating the zone and its key in
  Bunny is left — **a person's action**.
- **`pool.image.unreported`** — prod and staging do not name their build. It
  closes by itself the day a release newer than 2026-08-31 reaches them.

## Queue 5 — decisions the code is waiting for

These need no work — they need a word, and without it whatever gets written will
be rewritten.

- **`moderation.model`** — which moderation model. The spec says to settle it by
  measurement, and the bench is ready (`relay/moderation-bench`).
- **`refusal.texts.readaloud`** — the refusal wordings are not approved until they
  have been read out loud.

## Queue 6 — drift between documents · closed 2026-09-08

Five of the six. The sixth, `identity.cascades`, was not drift at all and moved
down, to what waits on the product.

- ~~**`schema.offers.missing`**~~ — `offers`, `venues` and `advertisers` are
  declared as real DDL in `docs/offers/SPEC_EN.md` and entered in the table
  registry. The snapshot code was reading `offers` by column names no document
  was answerable for.
- ~~**`feed.span.retired`**~~ — the journal entry about three chat spans is
  marked retired: the set in force has had four since 2026-08-26, and both of
  that entry's arguments are answered in the canon by name. The entry stays as
  the trace of a decision rather than being erased.
- ~~**`table.brand.equality`**~~ — nothing should hold them equal, and that is
  now written as a decision: `brand` is attribution, the world is one, a table is
  seen by intersecting circles. The price is named: one table's lines may carry
  different `brand` values.
- ~~**`table.eviction`**~~ — being shown out is not being locked out. A "may not
  return" column is not added: that is a trace about a person. What locks is the
  symmetric block — one person at the table is enough, and it disappears for both
  sides.
- ~~**`dsa.platform.queue.filter`**~~ — the notice queue now offers a choice of
  queue; the `brand IS NULL` rule lives in `inQueue` and is covered by a probe.

## What the plan leaves out

**Seven items that wait on the product** (`product.tables.unmigrated`, `J19`,
`identity.sweeper`, `table.sweeper`, `identity.cascades`, `G6`, `G9`) — the last
moved here on 2026-09-08 from queue 6: the cascade rule is decided and written
down, and there is nowhere to apply it, since none of its six tables exist in the
node's schema. These are not tasks but consequences of there being no chat and no
feed yet. They close with the product's own code, and
planning them separately means planning the product.

**Three comfort-weight items** are deferred on purpose and recorded as deferred.

**`J9` and `DSA-turnover`** are due 2027-08-05 and ask for nothing inside the
window.

## How to use this

`scripts/due.sh` shows what is coming up by date, `check-facts-open.sh` holds the
registry's shape. This document does not duplicate them: it says where to start
when both are silent — which is nearly always, because most items have no date
and can have none.
