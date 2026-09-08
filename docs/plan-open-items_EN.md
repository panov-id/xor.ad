# A plan for what is open — 2026-09-08

The registry `docs/facts/open.tsv` holds 33 items and answers "what is open". It
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

## Queue 2 — what can only be fixed before launch

Three items that threaten nothing today precisely because there is no product.
The day the product tables appear, each becomes a defect with data in it.

- **`probe.drops.feed.table`** — probes in `relay/node/test/database.test.ts`
  create `feed_messages` and `offers` with `CREATE TABLE IF NOT EXISTS` and drop
  them in `finally`. With the product migrated, a probe takes the real table and
  deletes it, rows and all. A sandbox schema fixes it: ~40 minutes.
- **`jobs.lease.unchecked`** — `enqueueOnce` checks and inserts with no unique
  index, `finish` deletes a row without checking the lease. With three jobs and
  one node this is invisible; with two nodes it yields two prune chains. ~1 hour
  including a migration.
- **`idempotency.unbounded`** — the table grows with no ceiling and no index on
  time. With no public traffic it grows slowly. ~40 minutes.

## Queue 3 — what is exposed today

- **`auth.link.unlimited`** — `/auth/request-link` has no rate limit: a mail bomb
  into an operator's inbox and growth of `panel/<env>/magic/` objects that
  nothing sweeps. ~1 hour including a sweeper for expired links.
- **`v1.no.address.limit`** — `/v1/*` has no per-address limit; the only barrier
  is the daily quota, which is cached for 10 seconds, counted per node, and
  **switches off when the database is unreachable**. ~40 minutes.
- **`metrics.public`** — `/metrics` is open on the node's public hostname. For
  `/health` that openness was a decision; for `/metrics` there was none. ~30
  minutes.
- **`mailer.body.logged`** — the mail provider's response body goes to an
  error-level log line, and those are copied to storage: somebody else's error
  puts recipient addresses there. ~20 minutes.

## Queue 4 — what goes off at three in the morning

- **`firewall.reset.window`** — `configure` begins with `ufw --force reset`, which
  disables the firewall; an ssh drop mid-chain leaves a public box open and no
  check would see it. ~1 hour to apply rules atomically.
- **`backups.same.zone`** — dumps live in the same storage zone under the same key
  as the node's working objects: one leak or one mistaken prune takes both the
  data and the backups. ~1 hour plus creating a second zone, which is a person's
  action.
- **`pool.image.unreported`** — prod and staging do not name their build. It
  closes by itself the day a release newer than 2026-08-31 reaches them.

## Queue 5 — decisions the code is waiting for

These need no work — they need a word, and without it whatever gets written will
be rewritten.

- **`moderation.model`** — which moderation model. The spec says to settle it by
  measurement, and the bench is ready (`relay/moderation-bench`).
- **`refusal.texts.readaloud`** — the refusal wordings are not approved until they
  have been read out loud.

## Queue 6 — drift between documents

Cheap edits, tens of minutes each: `schema.offers.missing`, `feed.span.retired`,
`table.brand.equality`, `table.eviction`, `identity.cascades`,
`dsa.platform.queue.filter`.

They come last not because they do not matter, but because each is caught by eye
on the next reading of the file it lives in — unlike queues 2–4, where there is
nothing to notice until it happens.

## What the plan leaves out

**Six items that wait on the product** (`product.tables.unmigrated`, `J19`,
`identity.sweeper`, `table.sweeper`, `G6`, `G9`) are not tasks but consequences of
there being no chat and no feed yet. They close with the product's own code, and
planning them separately means planning the product.

**Three comfort-weight items** are deferred on purpose and recorded as deferred.

**`J9` and `DSA-turnover`** are due 2027-08-05 and ask for nothing inside the
window.

## How to use this

`scripts/due.sh` shows what is coming up by date, `check-facts-open.sh` holds the
registry's shape. This document does not duplicate them: it says where to start
when both are silent — which is nearly always, because most items have no date
and can have none.
