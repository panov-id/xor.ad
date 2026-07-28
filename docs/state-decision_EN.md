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

## A constraint worth remembering

The nodes are spread out: `eu-nuremberg` ×2, `eu-frankfurt`, `us-central1`. A
shared database in Europe costs the American node 100–150 ms per call. That is
too much on a public request, so counters have to be **batched and approximate**
— accumulate locally, flush every few seconds — rather than a round trip per
call. Quota accuracy within seconds is what every API lives with, large ones
included.

## Options

### 1. Managed Postgres (Neon free / Supabase) — recommended

One database reachable from every node by connection string. The node stays
stateless, so the pool model survives — which answers `E2` with "yes, it stays
interchangeable".

- **For.** Atomicity, locks, server-side filtering, aggregates in one query —
  everything missing, out of the box. Branches per environment. Backups and PITR
  are somebody else's job. Neon free: $0 idle.
- **Against.** A new dependency in the public path, if written naively. Free-tier
  cold start (hundreds of ms) — handled by the same batching.
- **Mitigation.** The database is for quotas and the queue; accepting signups and
  page views stays on storage, so a database outage **does not take the landings
  down** — only quotas and the queue wait. That boundary should be explicit.

### 2. Postgres on one of our nodes

Cheap and vendor-free, but a single point of failure, backups on us, and a volume
tied to a machine. For control state that tenant billing depends on, that is
worse than option 1 with nothing gained but ideology.

### 3. Redis / Upstash

Covers counters and limits well, the queue poorly, and journals and aggregates
not at all. We would end up running it *and* a database.

### 4. Leave it

Viable while quotas are counted **per node** (each allowed 1/N) and the skew is
tolerated, and while there is no queue at all. An honest answer as long as the
only tenant is us. It stops being honest the day the first outside one arrives.

## Recommendation

**Neon (Postgres, EU region), for control state only.** In order:

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

$0 idle on the free tier, tens of dollars a month under real traffic — less than
today's storage bill for the same number of page views. Work: schema and
migrations, a day; keys and brands, a day; quotas, a day; the queue with its
worker and panel page, two or three.

## To decide before starting

- Neon or Supabase (the latter brings a familiar SDK and auth, but costs more and
  weighs more, and our auth is already our own).
- Database region: EU (most nodes) against us-central (one node). EU.
- Queue first or quotas first — webhooks need the queue, the public API needs
  quotas, and both wait on the same thing.
