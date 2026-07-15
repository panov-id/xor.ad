# Backend alternatives to Supabase (analysis, 2026-07)

Goal: escape Supabase Cloud's steep bill (3 environments → one Pro project each
≈ $45–75+/mo fixed, before usage) for something cheap now, without a rewrite, and
with a path to a realtime app later.

## TL;DR — recommendation

1. **Now, almost painless:** self-host OSS Supabase on one
   **Hetzner CX32 (~$8/mo, all 3 envs via schemas)**. The client SDK is
   identical — migration ≈ swap `SUPABASE_URL`/keys + run migrations. Realtime
   and Storage turn on later with no code change. The only price is ops
   (backups, upgrades, TLS, SMTP), and you're Docker-fluent and already run this
   stack locally. **This is the primary pick.**
2. **If you want to pay ~nothing while alpha sleeps:**
   **Neon Free (Postgres + branching = 3 envs) + Better-Auth (magic-link in your
   own backend) + Bunny Storage (already yours) + Deno Deploy (the 3 Deno
   functions almost as-is) + Resend**. ~$0 idle, ~$10–30 at 10k MAU. Downside:
   you assemble auth/realtime glue yourself.
3. **Interim without leaving at all:** collapse the 3 Supabase projects into
   **1 org + Branching** (~$25 + branch usage) — cuts the bill today, zero migration.

Keep Cloudflare (Durable Objects) in mind as the best realtime primitive for
ephemeral chat — but that's a rewrite; go there deliberately only.

## What's actually used today (drives the choice)

Right now (alpha/waitlist) only a sliver of Supabase is used, not "all of it":

- **Postgres:** 5 tiny tables (`waitlist`, `panel_users`, `push_subscriptions`,
  `client_errors`, `app_config`). Minimal data.
- **Auth:** magic-link (email OTP) for admin panel login + JWT verification. A
  couple of admins.
- **RLS:** yes.
- **Edge Functions (Deno):** `invite-panel-user`, `send-waitlist-welcome`,
  `main` (JWT gateway).
- **Web Push (VAPID):** subscriptions in Postgres.
- **Realtime and Storage are NOT used in code.** They're planned for the app
  (ephemeral feed + disappearing chat + stickers/images), not a current fact.

Takeaway: **cheap is needed now, heavy realtime/scale comes later.** Today's 3×
Supabase Pro mostly pays for air.

## Summary comparison

| Option | $/mo alpha (3 envs) | $/mo ~10k MAU | Migration (1–5) | Lose/gain |
|---|---|---|---|---|
| **Self-host Supabase** (Hetzner CX32) | **~$8** | ~$18–55 (CX42/CCX) | **2** | Everything the same, SDK identical; cost is ops |
| **Composable** (Neon+Better-Auth+Bunny+Deno Deploy) | **~$0** | ~$10–30 | 3 | Keep Postgres, Deno funcs almost as-is; assemble auth/realtime |
| **PocketBase** (1 VPS) | ~$5–15 | ~$10–40 | 4 | One binary, realtime/auth/storage/admin built in; SQLite single-writer |
| **Cloudflare all-in** (Workers+D1+DO+R2) | **~$5** | ~$5–20 | 4 | Lowest floor, DO best realtime for rooms; no Postgres/RLS, all by hand |
| **Bunny consolidation** | ~$15–30 | ~$40–90 | 4 | One vendor for stateless; no managed Postgres (Bunny DB = SQLite), DIY backups |
| **Appwrite** (self-host) | ~$0 + VPS | ~$20–60 | 3 | Closest FOSS parity to Supabase, heavier than PocketBase |
| Supabase Cloud (1 org + Branching) | ~$25 + branches | ~$50–90 | 1 | Cheaper status quo, still Supabase pricing |
| Nhost / Convex / Firebase | $0–25 | $25–150 | 5 | Rewrite and/or heavy lock-in — skip |

---

## 1. Self-host OSS Supabase (recommended)

The point: the Supabase SDK is byte-identical for Cloud and self-host, so
**app-code migration ≈ zero** — change `SUPABASE_URL` + anon/service keys and run
your SQL migrations. All the cost moves to ops, not dollars.

- The official `docker/docker-compose.yml` gives the same components: Postgres,
  GoTrue (auth), Realtime, Storage, Edge Functions (Deno), Studio, PostgREST.
  Your future Realtime/Storage work with no client rewrite.
- **Hardware is cheap; ops isn't.** Hetzner CX32 (4 vCPU/8 GB, ~€6.8/$7.7) runs
  the full stack for alpha; for ~10k MAU with Realtime, CX42 (8/16, ~€16.4) or a
  CCX (~$30–55). Even the top end is well under $75 Cloud.
- You now own backups, upgrades, TLS, SMTP, secret rotation, Realtime scaling
  (no autoscale). "Month one is the rough one," then ~1–2 hrs/mo.
- **Coolify** lowers ops a notch (deploy/updates/some backups) but is still
  public beta — vet before trusting prod.
- **3 envs without 3× cost:** dev/UAT/prod on one box via separate schemas/DBs
  or separate compose stacks. Put prod on its own box before public launch.

**Verdict:** one CX32 (~$8/mo, 3 envs via schemas) under docker-compose (or
Coolify) — near-zero code change, ~10× cheaper than 3 Cloud projects, scales to
future Realtime/Storage by bumping the box tier.

## 2. Composable — cheap serverless Postgres + separate pieces

~$0 while alpha idles, thanks to scale-to-zero.

**Postgres hosts:** Neon (Free 0.5 GB, scale-to-zero, copy-on-write branching —
branches = your dev/UAT/prod without 3 paid instances) is the best balance.
Prisma Postgres — no cold start (a plus for chat), but per-operation billing +
ORM coupling. Fly/Render/Railway — not scale-to-zero, $18–38/mo of idle cost for
alpha, skip.

**Pieces to replace the rest of Supabase:**

| Need | Cheapest option | $/mo |
|---|---|---|
| Auth (magic-link) | **Better-Auth** (TS library in your backend, on your Postgres) | $0 (+ email) |
| Realtime feed+chat | Postgres LISTEN/NOTIFY (feed) + Ably free (6M msg/mo) | $0 at alpha |
| Storage | **Bunny Storage** — already in the stack ($0.01/GB, CDN, no egress) | cents |
| Edge functions | **Deno Deploy** free (1M req/mo, same Deno — near-zero changes) | $0 |
| Email | Resend (already configured) | $0 |

**Combo verdict:** Neon + Better-Auth + Ably/LISTEN-NOTIFY + Bunny Storage +
Deno Deploy + Resend — ~$0 idle, ~$10–30 at 10k MAU, no rewrite of the Deno
functions. Downside: realtime and auth no longer share the DB's auth context
automatically — that glue is yours.

## 3. PocketBase — single binary

One Go binary: SQLite + realtime (SSE subs) + auth (incl. OTP/magic-link) + file
storage + admin UI + hooks (Go/JS). All 3 envs on one $4–5 VPS, cutting the ~$75
Supabase bill to single digits.

- **Ceiling is SQLite single-writer + no horizontal scale.** Reads and realtime
  fan-out scale far, but heavy concurrent writes/deletes (and ephemeral = many
  deletes) hit `SQLITE_BUSY`. Fine for alpha and small/medium prod, hard ceiling
  if it goes viral.
- Postgres migration = rewrite into collections + RLS→API rules (effort 4).

## 4. Cloudflare all-in — lowest floor, but a rewrite

Workers ($5/mo account unlocks D1+DO+R2+KV+Queues) + D1 (serverless SQLite) +
Durable Objects (realtime WS) + R2 (storage, zero-egress).

- **Durable Objects is the best-fit realtime primitive for your ephemeral app:**
  one DO per room/neighborhood, WS Hibernation, SQLite-in-DO for the ~2 h window,
  TTL via alarms.
- **R2 zero-egress** is a structural win for serving images/stickers.
- **Downsides:** no Postgres (D1 = SQLite, no RLS, different dialect), D1 10 GB
  cap and modest writes; RLS → app-layer authz in Workers; auth → Better-Auth on
  Workers; the 3 Deno functions → Workers runtime (rewrite). **This is a rewrite
  (4/5), not a migration.** One $5/mo really covers dev+UAT+prod at alpha.

## 5. Bunny — consolidate onto one vendor

Technically the backend **can** live on Bunny: **Magic Containers** (Docker, GA,
persistent volumes since Mar 2026) + **Edge Scripting** (Deno at the edge).

- **BUT: no managed Postgres on Bunny.** Bunny Database = managed
  **libSQL/SQLite** (preview), not Postgres/RLS. So Postgres is either self-hosted
  in a container (single-region, single-writer, DIY backups) or external (Neon/…).
- **Edge Scripting fits the 3 Deno functions cleanly** (same Deno/V8, $0.20/M req).
- **Cost ≈ Supabase, not a win:** ~$15–30 alpha, ~$40–90 at 10k MAU, plus more
  ops. A plain Hetzner VPS ($5–15) running your docker-compose is cheaper and
  simpler than orchestrating a stateful DB on Bunny.

**Verdict:** consolidating the *stateless* parts (Edge Scripting for functions +
a Magic Container for API/WS) is sensible; but Postgres stays external or
self-hosted, and for a solo dev that's more work than Supabase for ~no saving.

---

## How to migrate (top pick: self-host Supabase)

1. Spin up a Hetzner CX32, install Docker + the official Supabase
   `docker-compose` (or via Coolify).
2. Run `db/migrations/*` on the new Postgres (we already have
   `deploy/apply-migrations-cloud.sh` — repoint the URL).
3. Move secrets/JWT, configure SMTP (Resend — already set up) for magic-link.
4. Deploy the 3 Edge Functions to the self-host (`deploy-functions-cloud.sh`,
   change endpoint).
5. dev/UAT/prod as separate schemas/stacks on the box; put prod on its own box
   before public launch.
6. Swap `SUPABASE_URL`/keys in the landing + panel config (dev → uat → prod), run
   e2e (`run-landing-tests.sh`, `run-panel-tests.sh`).
7. Set up backups: cron `pg_dump` to Bunny Storage + a restore test.

Cheap zero-step right now if you're not ready to move: collapse the 3 projects
into 1 org + Branching — cuts the fixed bill immediately with no migration.

## Sources

Gathered 2026-07-15 from vendor docs and pricing: Supabase self-hosting/
branching/billing; Hetzner CX; Coolify; Nhost; PocketBase; Appwrite; Convex;
Firebase; Neon; Prisma Postgres; Xata; Nile; Railway; Render; Fly.io MPG;
Better-Auth; Logto; Zitadel; Ably; Soketi; Deno Deploy; Cloudflare Workers/D1/
Durable Objects/R2/KV/Queues; Bunny Magic Containers/Edge Scripting/Database;
Backblaze B2. Usage-billing figures (Neon/Prisma/CF/Bunny) are estimates from
published unit rates against our tiny data profile, not flat quotes.
