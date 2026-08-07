# Architecture: landings on the relay backend

How the landing backend works after moving it off Supabase onto the relay node
pool. Current for **both brands** (neighbro + sosed) and the panel — Supabase is
fully decommissioned (2026-07-22).

## Overview

The landing's static files sit on the Bunny CDN. The form (waitlist / client-error)
no longer talks to Supabase — it calls **relay**: a pool of identical Deno nodes
that accept the signup, store it in Bunny Storage, and send a welcome email via
Resend.

```
Visitor ── static from Bunny CDN
     │  fetch POST /waitlist  { email, brand:"neighbro", lang, accent, mode, ... }
     ▼
apiUrl (per env, from config.js):
   dev  → https://n1-dev.relay.panov.id       (node n1, private)
   uat  → https://n1-staging.relay.panov.id   (node n1, private)
   prod → https://api.relay.panov.id           (geo record → node p1, public)
     │  Caddy (Let's Encrypt TLS via DNS-01/Bunny) → reverse_proxy → Deno node
     ▼
  POST /waitlist ──┬─→ dedup by sha256(email) + store in Bunny Storage
                   │      waitlist/<env>/<hash>.json
                   └─→ welcome via Resend (the brand's account key,
                          from hello@neighbro.place; on dev, Mailpit instead of Resend)
  POST /client-error ─→ Bunny Storage: client-errors/<env>/<uuid>.json
  GET  /health, /metrics ─→ node status / Prometheus counters
```

## Components

| Component | Role |
|---|---|
| Bunny CDN (zones `neighbro-dev/uat/prod`) | hosts the static landing |
| relay node pool (Deno) | backend: `/waitlist`, `/client-error`, `/health`, `/metrics` (`/chat` slot — 501 stub) |
| Caddy (on each node) | TLS (Let's Encrypt, DNS-01 via Bunny), host-based routing |
| Bunny Storage (zone `sosed-waitlist-dev`) | leads, page views, client errors and server logs, split per tenant under `tenants/<brand>/…/<env>/` |
| Postgres beside the node (volume on the box) | control state: keys, brands, quotas, the queue, idempotency, daily aggregates. The port is never published; without `DATABASE_URL` the node runs entirely on storage. See `docs/state-decision_EN.md` |
| Resend (one account per brand) | welcome email from the brand's domain |
| Bunny DNS (zone `relay.panov.id`) | node hostnames + geo record `api.relay.panov.id` |
| GitHub Actions | build relay images (build-once) + deploy the landing per env |

## Nodes and environments

| Env | Node | Where | Access | Mail | Image |
|-----|------|-------|--------|------|-------|
| dev | n1-dev | Hetzner cpx22/nbg1 (IP in the local inventory) | private (443 from whitelist IPs) | Mailpit | `relay-node:<sha>` |
| staging (= landing uat) | n1-staging | same box n1 | private | Resend | `relay-node:vX.Y.Z` |
| prod | p1-prod | Hetzner cpx22/nbg1 (IP in the local inventory) | public (443) | Resend | same `vX.Y.Z` |

Landing ↔ relay per env:
`dev.neighbro.panov.id → n1-dev`, `uat.neighbro.panov.id → n1-staging`,
`neighbro.place → api.relay.panov.id` (geo record → p1).

`api.relay.panov.id` is the shared public prod entry; the brand is resolved from
the `brand` field (or `source`) in the request body — nodes are brand-agnostic
(`sosed` + `neighbro`).

## Release (build-once, promote)

One image is built once and promoted dev → staging → prod with no rebuild:

```
push dev ──CI──▶ relay-node:<sha>  → deploy dev
merge dev→main, tag vX.Y.Z ──CI──▶ relay-node:vX.Y.Z → deploy staging
published GitHub Release vX.Y.Z = approval → deploy --confirm-prod (same image)
```

Tooling — `relay/wizard` (Docker launchpad): `provision → dns → configure/deploy`,
`pool` (add a prod node to the geo record). Nodes are hardened (key-only SSH, a
sudo `deploy` user, default-deny firewall).

## No longer used

| Before | Now |
|---|---|
| Supabase as the landing backend | ❌ the landing never calls Supabase |
| `waitlist` table (Supabase) | ❌ leads → Bunny Storage |
| `client_errors` table (Supabase) | ❌ → relay `/client-error` |
| Edge Function `send-waitlist-welcome` | ❌ → the node sends the welcome via Resend |
| Bunny proxy zones `api.dev/uat.neighbro.panov.id`, `api.neighbro.place` (→ Supabase) | ❌ deleted in Phase 4 |
| Supabase anon key + `apikey`/`Authorization` headers on the form | ❌ not sent (relay is CORS-gated) |
| PostgREST `/rest/v1/...` | ❌ → relay `/waitlist`, `/client-error` |
| `push_subscriptions` (Supabase) | ❌ push **cancelled 07.08.2026** (`docs/pwa-push_EN.md`); the inert code and `supabaseUrl` were removed from the landings in Phase 4, the remnants and `vapidPublicKey` on 07.08.2026 |

## Decision: REST through Bunny, WebSocket direct

Taken 2026-08-05.

Proxy zones in front of the API existed before — and were **deleted** during the
migration off Supabase (see "No longer used"). What comes back is not that
construction: back then the zone proxied someone else's backend; now it is there
for what a single node cannot do — absorb a flood before it reaches the
application.

**Why it became necessary.** The public `/waitlist` has no protection at all:
no rate limit in the node, none in Caddy, and the daily quota in `lib/quota.ts`
counts per key — one key shared by every visitor. A bot that burns it in a minute
closes signups for everyone for a day. We are not taking an external captcha: that
is a new processor of other people's IPs for a single function. What remains is
the CDN we already run and already have as a processor.

**Prod naming:**

    pool.relay.panov.id   A (geo) → pool nodes       ← origin, closed from outside
    api.relay.panov.id    Bunny pull zone            ← what the landings call
    ws.relay.panov.id     A (geo) → pool nodes       ← chat, direct, once it exists

`apiUrl` in `config.js` does not change: the landings call `api.relay.panov.id`
exactly as before. What changes is what sits behind that name — a pull zone with
caching off instead of an A record, while the old geo record moves to `pool`.

**Dev and uat stay as they are.** They are private, port 443 is open to
whitelisted IPs only, and no public traffic reaches them. A CDN there would solve
a problem that does not exist.

**WebSockets stay off Bunny.** It can proxy them, but bills by connection-minute
($0.235 per million), and chat means long-lived connections. It gets its own
`ws.` name straight into the pool. Revisit when chat is built and there is
something to measure.

**Without a lock on the origin the whole thing is decorative.** If
`pool.relay.panov.id` stays reachable from outside, the CDN is bypassed in one
line. So, at the same time:

- Caddy checks an `X-Origin-Token` header, which Bunny adds by an edge rule;
- the firewall allows 443 only from Bunny edge addresses (the list comes from
  `https://api.bunny.net/system/edgeserverlist`, refreshed by a script);
- the node trusts `X-Real-IP` **only** when the token is valid — otherwise the
  header is forged and the rate limit is bypassed by substituting someone else's
  address.

**The node keeps its own rate limit** even behind the CDN: not duplication but the
last line. A CDN can be bypassed, the node cannot, and only the node knows whose
key and whose address it is.


## Notes

- **Supabase fully decommissioned** (2026-07-22): the landings (neighbro + sosed)
  and the panel (`xor.panov.id`) all run on relay; both Supabase projects are
  deleted, the api.* proxy zones and secrets removed. Pre-teardown data is in the
  `supabase-backup-2026-07-22/` backup.
- **relay dev/staging are private** — forms on `dev/uat.neighbro.panov.id` work only
  from whitelist IPs. **prod (`neighbro.place`) is public**.
- **Per-brand Resend**: each brand has its own Resend account (free tier = 1 domain
  per account). neighbro is set up; **sosed is not yet** (its welcome returns 401,
  while the waitlist still stores).
- A single shared Bunny store `sosed-waitlist-dev` serves all envs, split by path.

## Known loose ends

- Metric `relay_mail_total{result="sent"}` increments even on a non-2xx from Resend.
- sosed: create a Resend account (the landing is migrated; its welcome email
  currently fails while the waitlist still stores).
