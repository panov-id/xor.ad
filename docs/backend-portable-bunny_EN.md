# Portable backend on your own containers (Bunny-first, no lock-in)

Direction: **your own Docker containers that don't depend on where they run.**
Today on Bunny Magic Containers, tomorrow on Hetzner/Fly/Railway/any `docker run`,
with no rewrite. No Supabase stack and no Bunny-specific primitives (Edge
Scripting, Bunny Database/libSQL) in the load-bearing path.

## Portability principle (the key)

Everything rests on two ubiquitous standards:

1. **A standard Docker image** — your backend (API + auth + realtime + functions)
   as one image. Runs locally via `docker compose up`; the same image in prod.
2. **A standard Postgres via `DATABASE_URL`** — the DB speaks the wire protocol,
   reachable from any host.

As long as only these two are in the critical path, moving anywhere = change the
container host and (optionally) the `DATABASE_URL`. Bunny still gives CDN +
Storage + Anycast, but those are **not load-bearing** for portability — easily
swapped for R2/B2/any CDN.

## Architecture

```
[Bunny CDN] ── sosed/neighbro landings + panel (already so)
     │
     ▼  api.*  (proxy zones already exist)
[Anycast IP] ─► [Magic Containers pod: "xor-api"]  (min=max=1 per env)
                  └─ one container = your backend:
                       • REST/JSON API (landings + panel, CORS)
                       • magic-link auth (issue+verify JWT, email via Resend)
                       • realtime WS server (feed + disappearing chat)
                       • web-push (VAPID)
                       • AI-moderation calls
                       • cron/intervals: TTL cleanup of ephemera (~2h)
                          │
                          ├─(DATABASE_URL)─► [Postgres]  (DB choice below)
                          ├──────────────►  [Bunny Storage]  stickers/images
                          └──────────────►  [Resend]  email
```

**Container stack — your choice** (any you like; all portable): Deno + Hono,
Node + Fastify, or Go. Deno is convenient because the **three current Edge
functions** (`invite-panel-user`, `send-waitlist-welcome`, JWT gateway) port
over almost as-is — they just become routes inside the container.

## DB choice — two options (image portable in both; data portability differs)

### Option 1 (recommended) — external managed Postgres, data not tied to a place
`DATABASE_URL` to **Neon** (free tier, scale-to-zero, branches = dev/UAT/prod) or
any managed PG. Data lives independently of where the container runs — literally
"doesn't depend on where it stands": container on Bunny, DB in Neon, both move
separately. Managed backups/PITR out of the box, not your problem.

- Plus: durability, backups, branching for 3 envs, ~$0 when idle.
- Minus: DB isn't formally on Bunny (but the connection string works from any host).

### Option 2 — Postgres as your container too (maximally "all on Bunny")
`postgres:16` as a container in the **same pod** (talk over `localhost`),
persistent volume for data. All on Bunny, one vendor.

- Magic Containers reality (verified from docs, 2026-07): the volume is **pinned
  to one region/node, single-writer, ≤100 GB, 10 MB/s, NO managed backups or
  replication**; a node failure can strand the volume. → this is a **single point
  of failure**, backups are entirely on you.
- Mitigation: cron `pg_dump` → Bunny Storage + a tested restore; backups
  mandatory before prod. Data is small, so technically fine, but durability is
  weaker than Option 1.

> On portability: the Postgres image is always portable; what's "not portable" is
> the **data on the volume** (pinned to node/region). So for "doesn't depend on
> where it stands," keep the **data in Option 1** (managed) and the app container
> on Bunny.

## How it sits on Magic Containers (facts, 2026-07)

- **Pod = multiple containers** in a shared network namespace, talking over
  `localhost:<port>` (distinct ports required). No internal docker-compose — you
  add each image as a container in the pod; start order via health checks
  (Startup/Readiness/Liveness), not `depends_on`.
- **No private network between different apps** — only `localhost` inside one pod.
  So if Postgres is yours (Option 2) it goes in the same pod.
- **WebSockets** — via Anycast IP (needed, $2/mo/env). Concurrency/sticky limits
  undocumented → keep **1 WS replica** at alpha.
- **Billing:** CPU $0.02/CPU-hr (actual), RAM $0.005/GB-hr in 64 MB blocks
  (always-on floor, scale-to-zero unconfirmed), Anycast IP $2/mo, volume
  $0.10/GB-mo. Deploy: image to registry → dashboard/REST/**Terraform**
  (`bunnynet_compute_container_app`) — fits CI.

## Cost ballpark

| | Option 1 (Neon) | Option 2 (PG in pod) |
|---|---|---|
| Alpha, 3 envs | ~$12–18/mo (container+IP ×3) + Neon $0 | ~$15–24/mo (+ volumes, RAM for PG) |
| ~10k MAU | ~$30–60/mo | ~$40–90/mo |

Both are well under Supabase's ~$75, and — crucially — **no lock-in**.

## What you must build (and what you don't)

**Build** (a thin layer replacing Supabase's "batteries"):
- magic-link: issue token + email (Resend already set up) + verify → JWT.
- authorization instead of RLS: checks in route code (or enable Postgres RLS
  yourself — it's a real DB).
- realtime: WS server (native `ws`/socket.io); ephemera = in-memory + write to
  Postgres, TTL cleanup via cron.

**Don't rewrite:**
- Postgres + our `db/migrations/*` (Option 1 = just a new `DATABASE_URL`).
- The 3 Deno functions — become container routes.
- Bunny Storage/CDN/Resend — already in the stack.

Migration effort: **~3/5** (you build your own thin API/auth/realtime, but the DB
and the functions' logic are preserved).

## Phased plan + checklists

Order: get the backend working locally (docker-compose) first, then put it on
Bunny. That way portability is proven from day one.

### Phase 0 — decisions (before start)
- [ ] Pick container stack: Deno+Hono / Node+Fastify / Go
- [ ] Pick DB: **Option 1 (Neon managed)** vs Option 2 (PG in pod)
- [ ] Confirm undocumented bits with Bunny support: scale-to-zero, WS limits
      (concurrency/sticky), min container CPU/RAM
- [ ] Freeze the API endpoint list (from current landing/panel/functions)

### Phase 1 — backend skeleton (local)
- [ ] Backend repo + Dockerfile (single image)
- [ ] Config via env only: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`,
      `VAPID_*`, `BUNNY_STORAGE_*`, `PORT`
- [ ] Health endpoints: startup / readiness / liveness
- [ ] `docker-compose.yml` (api + postgres:16) for local dev
- [ ] CORS for the landing/panel domains

### Phase 2 — DB and migrations
- [ ] Schema: the 5 current tables + `posts` (feed) + `messages` (chat, `expires_at`)
- [ ] Port `db/migrations/*` (adapt `deploy/apply-migrations-cloud.sh` to the new
      `DATABASE_URL`)
- [ ] **Option 1:** Neon project + 3 branches dev/UAT/prod, run migrations
- [ ] **Option 2:** volume in the pod, `pg_dump` cron → Bunny Storage + restore test
- [ ] Authorization instead of RLS: rules in route code (or enable Postgres RLS)

### Phase 3 — port the existing pieces
- [ ] `invite-panel-user` → route
- [ ] `send-waitlist-welcome` → route (Resend already configured)
- [ ] JWT gateway → session-verify middleware
- [ ] magic-link: issue token + email (Resend) + verify → session JWT
- [ ] web-push (VAPID): ES256 sign + aes128gcm (port the current function)

### Phase 4 — realtime
- [ ] WS server in the container: feed + disappearing chat
- [ ] Ephemera TTL: lazy `WHERE expires_at > now()` filter + periodic cleanup
      (cron/interval in the container — Bunny has no native cron)
- [ ] At alpha — 1 WS replica (no sticky routing)
- [ ] Load/limits as a separate task before public launch

### Phase 5 — deploy to Bunny
- [ ] Build image → container registry
- [ ] Magic Containers app per env (Terraform `bunnynet_compute_container_app`),
      min=max=1 at alpha
- [ ] Anycast IP (for WS), env secrets, health checks
- [ ] (Option 2) Postgres as a container in the same pod, persistent volume,
      volume pinned to a region

### Phase 6 — cutover
- [ ] Repoint `api.*` proxy zones / landing + panel config: dev → uat → prod
- [ ] Run e2e: `run-landing-tests.sh`, `run-panel-tests.sh`
- [ ] Smoke: waitlist submit, panel magic-link login, web-push
- [ ] Tear down Supabase projects after confirmation

### Portability checklist (invariant — never break)
- [ ] No Bunny-specific pieces in the load-bearing path (don't make Edge
      Scripting/libSQL mandatory — only Docker + Postgres wire)
- [ ] Everything comes up locally with a single `docker compose up`
- [ ] Leaving Bunny = change image host and/or `DATABASE_URL`, no code changes
- [ ] Storage behind an abstraction (Bunny Storage ↔ R2/B2 swap by config)

### Backups/durability checklist (mandatory before prod)
- [ ] Option 1: confirm Neon PITR/backups are on for the prod branch
- [ ] Option 2: cron `pg_dump` → Bunny Storage + a **tested** restore
- [ ] Prod data isolated (own DB/branch/box), not shared with dev/uat

## Bottom line

One Docker image (API+auth+realtime+functions) on Bunny Magic Containers +
**Postgres on Neon** (data not tied to a place) + Bunny Storage/CDN + Resend.
Cheap, no Supabase, no Bunny lock-in: `docker compose up` locally, the same image
in prod, moving anywhere = change host and/or `DATABASE_URL`. If you truly want
everything on Bunny — Postgres as a container in the same pod (Option 2), but with
DIY backups and single-region risk.
