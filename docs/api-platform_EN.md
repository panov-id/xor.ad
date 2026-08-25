# API platform: public API, webhooks, notifications, queues

The map of the forks and what each one costs. The decisions come before the code
because one of them changes the node's architecture outright (see "The central
tension").

**Part of this document has stopped being a draft** (updated 2026-08-10). Until
10 August it said "nothing is built", while these were built and running: `/v1`
(`routes/v1.ts`), secret keys with quotas (`db/002`, `db/004`, `lib/quota.ts`),
idempotency on `/v1/waitlist` (`lib/idempotency.ts`), the job queue (`db/001`,
`lib/jobs.ts`) and Postgres beside the node. What remains a draft is everything
below about webhooks and notifications.

## What exists today

| Piece | State |
| --- | --- |
| HTTP node | Deno, own router: `POST /waitlist`, `POST /report`, `POST /pageview`, `POST /client-error`, `GET /health`, `GET /metrics` |
| Public API | `/v1/waitlist`, `/v1/pageview`, `/v1/client-error`, `/v1/me` under a secret key |
| Admin routes | `/admin/*`: brands, keys, quotas, logs, Article 16 notices |
| Article 16 notices | intake, queue, decision, letters — built (`docs/dsa/`) |
| Chat | stub slot `GET /chat` → 501 |
| Storage | an "object per record" abstraction: Bunny Storage on the pool, `fs` on the local stand |
| Mail | Resend (per brand) / SMTP on the stand |
| Panel | Refine + magic-link sessions, the `access/` RBAC core, audit trail, log explorer |
| Observability | structured JSON logging to stdout, Prometheus counters |

The defining property of the node today: **it holds no state of its own**. Data
lives in object storage, while control state — brands, keys, quotas, the queue,
idempotency, daily aggregates — lives in **Postgres beside the node, one database
per environment** (decided 2026-07-28, `relay/node/db/001_control_state.sql`).
That does not stop the nodes being interchangeable, but "all state lives in object
storage" is no longer true, and the constraints below read with that correction
(edit of 2026-08-23).

## The central tension

A queue is state with locks: take a job, hand it to nobody else, put it back if it is
not acknowledged within N seconds. Object storage cannot do that — no atomic
compare-and-swap, no leases, and `list` is not consistent.

So any honest queue means **a new state store** beside the node. That is the first and
biggest fork, and everything else (webhooks, notifications, retries) hangs off it,
because webhook delivery without a retrying queue is not delivery.

Options, cheapest first:

| Option | What it buys | What it costs |
| --- | --- | --- |
| **No queue**, send inside the request | zero infrastructure | events lost on failure, no retries, slow responses |
| **Postgres (we already run our own, beside the node)** — a jobs table plus `SELECT … FOR UPDATE SKIP LOCKED` | transactions, retries, DLQ, inspectable in SQL | the node stops being stateless-over-objects; the pool needs connectivity to the database |
| **Redis/Valkey beside the pool** | fast queues, streams, TTL | one more production service; persistence is its own decision |
| **External queue** (QStash / Cloudflare Queues) | retries and schedules out of the box, nodes stay stateless | an external dependency, its limits, data leaves the perimeter |
| **Deno KV** on the node | no external service at all | node-local, not shared across the pool — unusable for a pool |

Provisional recommendation: **Postgres**, because our own database already runs beside the
node and it is the only option where the queue, the webhook subscriptions
and the delivery log live in one place and can be queried like adults. But it is a
deliberate retreat from "the node knows nothing but objects" — worth discussing.

---

## 0. Multi-tenancy: third-party developers as brands

Decided: the platform's consumers are **third parties**. A third-party developer
connects their own domain as a brand and gets a full backend — event intake,
transactional email from their own domain, outgoing webhooks, and **a separate panel
login** with their own users, roles, audit trail and log explorer, all scoped to their
brand.

That settles open questions 2, 3 and 4 at once: keys, limits and public documentation
become mandatory rather than optional; webhooks are customer-facing (so a subscription
UI, secret rotation and a delivery SLA); and notifications are needed in both flavours,
operator alerts and product messages.

**What already supports this.** A brand is not a new concept: `Brand { key, name,
domain, from, match[] }` in `relay/node/src/config.ts` is added through the `BRANDS`
env with no code change, and mail is already per-brand (`RESEND_KEYS_BY_BRAND` — one
account and one sender domain per brand). The most expensive part of the offer — "the
email comes from you, not from us" — works today.

**What is missing.** A brand today is a label, not a data boundary, and in that shape
it cannot be handed out:

```ts
// routes/waitlist.ts — the brand arrives in the request body; the client picks it
const brandHint = typeof body.brand === "string" ? body.brand : undefined;

// …but the object key carries no brand: one namespace shared by everyone
const key = `waitlist/${config.envName}/${await sha256hex(email)}.json`;
```

Two consequences follow, each fatal for a tenant: **deduplication is global** (an email
signed up under tenant A is a "duplicate" for tenant B, whose lead is silently
dropped), and **there is no isolation** (the body may name anyone else's brand).

**The shape of the fix.** The brand moves into the key prefix, and its value comes from
the request's subject rather than from the body:

```ts
// before
const key = `waitlist/${config.envName}/${await sha256hex(email)}.json`;

// after — the tenant is in the prefix, deduplication happens within the tenant
const key = `${subject.brand}/waitlist/${config.envName}/${await sha256hex(email)}.json`;
```

The subject carries the brand in both of its kinds, and `null` means a platform
operator, who sees everything:

```ts
export type AccessSubject =
  | { kind: "user"; role: Role; brand: string | null }
  | { kind: "key";  scopes: readonly Permission[]; brand: string };
```

The point: `can()` answers "is this action allowed", while tenancy is a second
question — "over whose data" — and it is not solved by adding a filter to the routes.
One forgotten read is a leak between tenants. So storage access goes through a layer
that physically cannot return someone else's prefix:

```ts
function scoped(subject: AccessSubject) {
  const prefix = subject.brand ? `${subject.brand}/` : "";
  return {
    put:  (path: string, body: unknown) => storage.put(prefix + path, body),
    get:  (path: string) => storage.get(prefix + path),
    list: (path: string) => storage.list(prefix + path),
  };
}
```

An API key gains an owner and a quota:

```ts
interface ApiKey {
  id: string;
  hash: string;
  brand: string;          // the tenant; hard-bounds the key's reach
  scopes: Permission[];
  quota: { events_per_day: number; webhooks_per_day: number };
  // …remaining fields in section 1
}
```

**What this adds to the work.** Two things absent from the sections below: *tenant
onboarding* and *quotas with billing* (a per-key counter, shared across the pool —
which object storage cannot hold).

**There will be no self-service registration — settled 2026-07-29.** A tenant is
onboarded by the platform alone: it creates the brand, then an operator inside that
brand, and the node emails them an invitation. The reason is that a brand here is a
data boundary, not a line on a form: an open registration page would mean a stranger
creating their own namespace, keys and panel access in one click, with the platform
finding out afterwards. While tenants are onboarded one at a time and by agreement, an
invitation describes what actually happens more honestly than a signup form would.

The invitation is the same one-time token as an ordinary sign-in link, but it lives
seven days instead of fifteen minutes: a letter is read from an inbox the next
morning, not in the same minute. Sending it again is
`POST /admin/panel-users/:email/invite`, under the same visibility rules — a tenant
cannot invite anyone into a brand it cannot see.

## 1. Public API

The endpoints today are flat and unversioned. A public API freezes that forever, so
the shape comes before the content.

**Versioning.** A `/v1/…` prefix. The existing `POST /waitlist` and
`POST /client-error` stay as they are (the landings call them) and are aliased under
`/v1`.

**`GET /v1/me`** — what this key is. It answers with the key's own id, the brand
it speaks for, its name and its scopes:

```json
{ "id": "ak_live_7f3c…", "brand": "neighbro", "name": "sosed.place landing", "scopes": ["waitlist.write"] }
```

It exists because the alternative is guessing. A caller holding a key that has
been revoked, rotated or issued for the wrong brand otherwise learns that from a
401 on the request that mattered; this is the one call that answers "is this key
alive, and what may it do" without side effects. It reveals nothing the holder
of the key does not already have — it is the key describing itself — and it was
in the code for months before it was written down here, which is how this entry
came to be added.

**Authentication.** The panel JWT is for humans. Machines get keys:

```ts
// Shown once at creation; only the hash is stored.
interface ApiKey {
  id: string;            // "ak_live_7f3c…" — the prefix is visible in the panel and in logs
  hash: string;          // sha256 of the secret
  name: string;          // "sosed.place landing"
  scopes: Permission[];  // the same strings the access core uses
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
```

The point: **a key's scopes are the same permissions a role has**. The `access/` core
already answers "is this allowed", and `AccessSubject` grows a second kind of subject
without changing the `can()` contract:

```ts
export type AccessSubject =
  | { kind: "user"; role: Role }
  | { kind: "key"; scopes: readonly Permission[] };
```

**Errors.** One shape everywhere:

```json
{ "error": { "code": "rate_limited", "message": "…", "request_id": "…", "retry_after": 30 } }
```

**Idempotency.** An `Idempotency-Key` header on every POST: key plus body hash maps to
the stored response, and a repeat returns the same result. Without it, client retries
create duplicates.

**Pagination.** Cursor-based, exactly as the log routes already do (`before` plus
`limit`) rather than offset — offset is meaningless over object storage.

**Rate limiting.** Per key and per IP. With no shared state the limit is per node
(so N nodes means N× the intended limit) — another argument for a shared store.

## 2. Outgoing webhooks

A subscription:

```ts
interface WebhookSubscription {
  id: string;
  url: string;
  events: string[];        // "waitlist.created", "panel_users.role_changed", "*"
  secret: string;          // for the signature; shown once
  active: boolean;
  created_at: string;
}
```

**Signing.** HMAC-SHA256 over `timestamp.body`, sent as `X-Xor-Signature: v1=<hex>`
and `X-Xor-Timestamp`. The receiver must reject stale timestamps — otherwise the
signature does not protect against replay.

**Delivery.** One synchronous attempt? No: delivery has to be asynchronous, or a slow
subscriber slows our API down. Hence the queue above, with retries at
`1m → 5m → 30m → 2h → 6h` and a dead-letter queue when they run out.

**A delivery log** is the audit trail again: one record per attempt, and a panel page
on top of the existing `LogExplorer` (window, histogram, cursor — already written),
with a "replay" button per record.

**First events:** `waitlist.created`, `client_error.received`, `panel_user.created` /
`.role_changed` / `.deleted`. The last three are already written to the audit trail —
a webhook simply becomes a second consumer of the same event.

## 3. Incoming webhooks

Receiving other people's events (Resend — delivery, bounce, complaint; payments if
they ever appear):

- verify the provider's signature **before** parsing the body;
- deduplicate on the provider's event id;
- answer `2xx` fast and do the work in the queue.

The immediate payoff: Resend events answer "did the email arrive", which today has no
answer at all.

## 4. Notifications

| Channel | State | What it needs |
| --- | --- | --- |
| Email | working (Resend, per brand) | templates decoupled from the welcome-email code |
| In-panel | none | an event feed from the audit trail and deliveries; the cheapest of the four |
| Telegram | none | bot token, chat id; handy for on-call alerts |

The fork: notifications are **a layer above the queue** (template + channel +
recipient + preferences), not "one more Resend call in a route". Otherwise every new
event gets fanned out to channels by hand all over again.

## 5. Queues — the job shape

```ts
interface Job {
  id: string;
  kind: string;            // "webhook.deliver" | "email.send"
  payload: unknown;
  run_at: string;          // delayed start and backoff
  attempts: number;
  max_attempts: number;
  locked_until: string | null;  // the worker's lease
  last_error: string | null;
  created_at: string;
}
```

The worker is a separate process from the same image (`deno run worker.ts`): it claims
jobs in batches, extends its lease, and if it dies the job returns on its own when the
lease expires. On the pool that is one worker per node, with contention settled by the
database lock.

The panel shows queue depth, the age of the oldest job, the DLQ, and a replay button.
Prometheus metrics: `queue_depth`, `job_attempts_total`, `job_duration_seconds`.

## 6. Permissions

The `access/` core grows strings and the role map grows entries. `can()` is untouched:

```ts
"api_keys.read", "api_keys.write",
"webhooks.read", "webhooks.write", "webhooks.replay",
"queues.read", "queues.manage",
```

The core's rule still holds: an unmapped resource/action pair in the panel is
**denied**, so a new page with no permission decision opens for nobody.

## 7. Order of work, if we do it

1. **Tenancy** (section 0): the brand in storage keys, `brand` on `AccessSubject`, the
   `scoped()` access layer, migration of existing objects.
2. API keys: hash storage, scopes, owning brand; `/v1` with idempotency.
3. The state store (the decision from "The central tension"), plus quotas, limits, the
   jobs table and the worker.
4. Outgoing webhooks on the queue: subscriptions, signing, retries, delivery log.
5. The tenant panel: login, own users, keys, subscriptions, deliveries, queue (every
   page on `LogExplorer`). No brand registration here: the platform creates it and
   invites the tenant by email (see section 0).
6. Incoming Resend webhooks → email delivery status.
7. The notification layer: email and in-panel notices. Web push is cancelled (`pwa-push_EN.md`).

Tenancy comes first deliberately, against the temptation to start with the queue: it
rewrites the storage key layout, and the queue, the delivery log and the quotas all sit
on top of it. In the other order every one of them gets migrated a second time.

## Open questions

1. ~~Where does state move to~~ — settled 2026-07-28: **our own Postgres beside
   the node**, for control state only (keys, brands, quotas, the queue,
   idempotency, aggregates). Data — leads, page views, errors, logs — stays in
   object storage. The reasoning: `state-decision_EN.md`.
2. ~~Who consumes the public API~~ — decided: third parties, a full BaaS with its own
   panel login (section 0). Which settles 3 — webhooks are customer-facing — and 4 —
   notifications are needed in both flavours.
5. **Do nodes stay interchangeable?** — yes for now, with a caveat. The node
   still holds no state of its own; the database lives beside it on the same box.
   That holds **while an environment has one box**. A second box in the same
   environment would bring up a second database and split the state silently, so
   the wizard rejects that configuration. The real answer is due when the pool
   actually grows: one database per environment over the network, or managed.
