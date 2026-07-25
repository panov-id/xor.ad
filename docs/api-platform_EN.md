# API platform: public API, webhooks, notifications, queues

A draft for discussion. Nothing is built — this is the map of the forks and what each
one costs. The decisions come before the code because one of them changes the node's
architecture outright (see "The central tension").

## What exists today

| Piece | State |
| --- | --- |
| HTTP node | Deno, own router, `POST /waitlist`, `POST /client-error`, `GET /health`, `GET /metrics` |
| Chat | stub slot `GET /chat` → 501 |
| Storage | an "object per record" abstraction: Bunny Storage on the pool, `fs` on the local stand |
| Mail | Resend (per brand) / SMTP on the stand |
| Panel | Refine + magic-link sessions, the `access/` RBAC core, audit trail, log explorer |
| Observability | structured JSON logging to stdout, Prometheus counters |

The defining property of the node today: **it holds no state of its own**. All state
lives in object storage, so nodes are identical and interchangeable. Every constraint
below follows from that.

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
| **Postgres (Supabase is already there)** — a jobs table plus `SELECT … FOR UPDATE SKIP LOCKED` | transactions, retries, DLQ, inspectable in SQL | the node stops being stateless-over-objects; the pool needs connectivity to the database |
| **Redis/Valkey beside the pool** | fast queues, streams, TTL | one more production service; persistence is its own decision |
| **External queue** (QStash / Cloudflare Queues) | retries and schedules out of the box, nodes stay stateless | an external dependency, its limits, data leaves the perimeter |
| **Deno KV** on the node | no external service at all | node-local, not shared across the pool — unusable for a pool |

Provisional recommendation: **Postgres**, because Supabase is already in the
infrastructure and it is the only option where the queue, the webhook subscriptions
and the delivery log live in one place and can be queried like adults. But it is a
deliberate retreat from "the node knows nothing but objects" — worth discussing.

---

## 1. Public API

The endpoints today are flat and unversioned. A public API freezes that forever, so
the shape comes before the content.

**Versioning.** A `/v1/…` prefix. The existing `POST /waitlist` and
`POST /client-error` stay as they are (the landings call them) and are aliased under
`/v1`.

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
| Web push | draft in `docs/pwa-push_*.md` | VAPID keys, subscription storage, sending from the queue |
| In-panel | none | an event feed from the audit trail and deliveries; the cheapest of the four |
| Telegram | none | bot token, chat id; handy for on-call alerts |

The fork: notifications are **a layer above the queue** (template + channel +
recipient + preferences), not "one more Resend call in a route". Otherwise every new
event gets fanned out to channels by hand all over again.

## 5. Queues — the job shape

```ts
interface Job {
  id: string;
  kind: string;            // "webhook.deliver" | "email.send" | "push.send"
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

1. The state store (the decision from "The central tension"), plus the jobs table and
   the worker.
2. Outgoing webhooks on the queue: subscriptions, signing, retries, delivery log.
3. Panel pages: keys, subscriptions, deliveries, queue — all on `LogExplorer`.
4. Incoming Resend webhooks → email delivery status.
5. The notification layer (email + in-panel), then web push.
6. The public `/v1` with keys, idempotency and limits.

The first two make everything after them nearly free; item six without item one is
self-deception, because a public API without retries and limits does not survive long.

## Open questions

1. **Where does state move to** — Postgres/Supabase, Redis beside the pool, an
   external queue? This decision blocks everything else.
2. **Who consumes the public API** — our own landings and app, or third parties? That
   decides whether keys, limits and public documentation are needed at all.
3. **Webhooks for whom** — our own services, or customers? Customer webhooks require a
   subscription UI, secret rotation and a delivery SLA.
4. **Notifications for whom** — operators (alerts) or users (product email and push)?
   Those are two layers with different requirements.
5. **Do nodes stay interchangeable?** If yes, the queue and worker must live outside
   the node; if no, the node becomes a stateful service and the pool's deployment
   model changes.
