# E1: where state moves

Written 2026-07-28. It stands as open question 1 in `api-platform_EN.md` and
blocks three checklist items at once — quotas (`B5`), secret keys with the public
`/v1` (`B6`), and page-view aggregation (`Db3`) — besides explaining two
workarounds already in the code.

## The question is narrower than it sounds

The earlier reviews (`backend-alternatives_EN.md`,
`backend-portable-bunny_EN.md`) answered "where should the whole backend live"
and led to where we are: stateless nodes, data in object storage, no vendor in
the critical path. That decision has held and **does not need revisiting**.

E1 is about the remainder: a few things object storage cannot do in principle,
rather than has not been made to do.

## What storage cannot do — from the code

| Needed | Why storage cannot | Where it already hurts |
|---|---|---|
| Atomic increment | `PUT` overwrites; two nodes lose a count | Per-key quotas (`B5`) are unwritten |
| A pool-wide windowed counter | Each node sees only itself | A shared rate limit (`B6`) is unwritten |
| Select with a lease | No lease, no "taken and not returned" | The job queue and webhook retries (`api-platform`, §5) |
| Conditional write | No "insert if absent" | `/v1` idempotency |
| Server-side filtering | Filtering means reading first | A tenant's audit: read the window, discard the rest, capped at 500 |
| Aggregates | Only a full recount | Page views: one object per view, held down by retention (`Db1`) |
| A consistent registry | A 60-second TTL cache | Key revocation lands within a minute, not at once |

One more symptom is `C1`: the platform's `/admin/waitlist` does a `list` and a
`get` per record across every brand. Fine at hundreds of leads, not beyond.

## What must NOT move

Leads, page views, client errors, server logs, welcome mail — storage handles
them well: many records, read rarely, cheap, and they survive any node dying.
Moving them into a database would be a cost with nothing bought.

What moves is **control state**: keys, brands, quotas, the queue, idempotency,
daily aggregates. Kilobytes, not gigabytes.

## The constraint to keep in mind

The inventory lists four boxes; two are up: `p1` (prod) and `n1` (dev +
staging). The rest are lines without an address. While **each environment has one
box**, a database beside the node is one database per environment and everything
adds up.

**A second box in the same environment breaks that silently.** It would bring up
its own Postgres and the state would drift apart: a key minted on one would not
exist on the other, a quota would be counted twice at half each. Nothing would
error — two nodes would simply start disagreeing.

So the wizard refuses to deploy a second database for an environment that already
has more than one box, and says what to do instead: one database per environment
reached over the network (TLS, firewall), or managed. That is the moment option 2
below stops being a cost with nothing bought.

Separately: even with the database next door, quotas should be counted in
**batches** — accumulate locally, flush every few seconds — rather than a round
trip per public request. Accuracy within seconds is what every API lives with.

## Options

### 1. Postgres beside the node — chosen

A container in the same compose as the node, reached by service name on the
compose network. The port is never published, so the database has no network
surface beyond the box.

- **For.** No network latency (the query never leaves the machine), no cost
  beyond the server already paid for, no tier limits, no cold start, and no extra
  vendor in the critical path.
- **On the single point of failure.** None is added: prod is served by one box,
  `p1`, and if it goes the relay goes with it. A database on that box shares the
  fate of what it serves rather than creating a new way to fail.
- **The minus that stays.** Backups are ours: `pg_dump` on a schedule into Bunny
  Storage, plus a regular check that a dump restores. A dump nobody has restored
  is not a backup, it is a hope.
- **When to revisit.** When `n2`/`n3` come up in other clouds and nodes from
  different providers need one database. The question then is not "ours or
  managed" but "how do the networks meet", and it deserves load figures. The code
  is ready either way: the database is a `DATABASE_URL`, not an architecture.

### 2. Managed Postgres (Neon / Supabase)

Gives backups and PITR for free and removes the only real minus of option 1. It
also adds a vendor to the path, latency where there is none today, tier limits
and a free-plan cold start. For the current shape — one prod node, database
beside it — that is a cost with nothing bought.

### 3. Redis / Upstash

Covers counters and limits well, the queue poorly, and journals and aggregates
not at all. We would end up running it *and* a database.

### 4. Leave it

Viable while quotas are counted **per node** (each allowed 1/N) and the skew is
tolerated, and while there is no queue at all. An honest answer as long as the
only tenant is us. It stops being honest the day the first outside one arrives.

## Decision

**Our own Postgres beside the node, for control state only.** In order:

1. Schema: `api_keys`, `brands`, `quota_counters`, `jobs`, `idempotency`,
   `pageview_daily`. Migrations as plain SQL files.
2. Move keys and brands there: the TTL cache disappears, revocation becomes
   immediate, and the registry becomes consistent.
3. Quotas: a local counter per node, flushed in batches; the limit check reads
   the aggregate. Accurate within seconds.
4. The queue and its worker (`api-platform`, §5) — the reason for all of this:
   webhooks with retries and a delivery log.
5. Audit and `/admin/waitlist` onto SQL filters, retiring "read everything and
   drop the rest".
6. Daily page-view aggregates; retention stays, but as cleaning up raw material
   rather than the only defence.

**The boundary we keep explicit:** accepting data — signups, views, errors —
never depends on the database. Database down: landings work, quotas and the queue
wait. That property is what makes the current architecture worth having.

## What it costs

In money, nothing: a container and a volume on servers already paid for. In
memory, `postgres:16-alpine` idles at 50–100 MB, which a `cpx22` will not notice.
Work: schema and migrations, a day; keys and brands, a day; quotas, a day; the
queue with its worker and panel page, two or three.

The real price is operations: backups, restore drills, major-version upgrades.
That is exactly what managed sells.

## How it is laid out

- A `postgres:16-alpine` container in the box's compose, a `pgdata` volume, no
  published port. The wizard deploys it, writes `postgres.env`, and creates one
  database per environment (`relay_dev`, `relay_staging`, `relay_prod`) — dev and
  staging share a box and must not share rows.
- The node gets a `DATABASE_URL` to its own. Unset, the node behaves exactly as
  before, entirely on storage: that is every environment before the rollout, the
  local stand without Postgres, and the way back if something is wrong.
- Backups: a daily `pg_dump` into Bunny Storage and a script that verifies a
  restore.

## Still to decide

Queue first or quotas first — webhooks need the queue, the public API needs
quotas, and both wait on the same thing.

## Rolled out (2026-07-28)

All three environments run on their own Postgres beside the node.

| Environment | Box | Image | Database | Backup |
|---|---|---|---|---|
| dev | n1 | `v0.8.0` | `relay_dev` | nightly, restore verified |
| staging | n1 | `v0.8.0` | `relay_staging` | nightly |
| prod | p1 | `v0.8.0` | `relay_prod` | nightly, restore verified |

Two brands and two keys migrated per environment; the objects in storage were
left in place — the node reads the database first and falls back to them, so
unsetting `DATABASE_URL` restores the previous behaviour.

Verified on production: the live landing keys work (`200`), the panel reads its
list from the database, and mint → use → **revoke → immediate `401`**, with no
wait. That was the point.

Backups: `pg_dump` into `backups/<env>/postgres/` nightly at 03:20 UTC with
jitter, kept a fortnight, old ones removed only after a successful upload. The
restore drill (`scripts/verify-backup-restore.sh`) brings a dump up in a
throwaway container and compares counts with the running environment: dev and
prod both matched.
