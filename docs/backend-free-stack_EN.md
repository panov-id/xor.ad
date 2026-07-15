# Free stack: Neon + Deno Deploy + Bunny (€0 over credit)

Goal: run the backend at **€0 extra** (you have ~€13 Bunny credit), no Supabase,
and stay portable (standard Postgres + standard Deno/Web APIs — move anywhere
with no rewrite).

> Build on the current Deno Deploy platform (console.deno.com) — figures below are for it.

## Why this fits "no more paying"

- **An always-on Bunny container would burn credit 24/7** (RAM + Anycast IP ≈
  $3/mo/env). Here there are **no always-on servers of yours** — Neon and Deno
  Deploy are serverless and sleep → no fixed fee.
- **DB not on Bunny — and that's a plus:** managed Neon gives backups/branches/
  scale-to-zero for free; the `DATABASE_URL` works from any host → portability kept.
- **Bunny stays what you already pay for** (CDN + Storage). No new products/
  subscriptions — only existing credit is spent by traffic (cents at alpha).

## Architecture

```
[Bunny CDN]  ── sosed/neighbro landings + panel  (already so)
     │
     ▼  api.*  (proxy zones already exist)
[Deno Deploy]  ── your backend (Deno/TS):
     • REST/JSON API (landings + panel, CORS)
     • magic-link auth (JWT via WebCrypto) + sessions
     • the 3 current functions → routes
     • web-push (VAPID)
     • Deno.cron: TTL cleanup of ephemera (~2h)
     • realtime: Deno.upgradeWebSocket (feed/chat) — see caveat
        │
        ├─(DATABASE_URL, pooled)─► [Neon Postgres]  system of record
        ├──────────────────────►  [Bunny Storage]   stickers/images
        └──────────────────────►  [Resend]          email
```

State lives only in Neon (and optionally Deno KV). Keep Deno Deploy **stateless**
so instance recycling is survivable.

## Free-tier limits (verified 2026-07-15; next-gen still changing — re-check at deploy)

### Neon Free
| Item | Value |
|---|---|
| Storage | **0.5 GB / project** |
| Compute | **100 CU-hours / project / month** (~400 h at 0.25 CU) |
| Autoscale | up to 2 CU (8 GB RAM) |
| Scale-to-zero | after 5 min idle (can't disable on Free) |
| Projects / branches | 100 projects; **10 branches/project** |
| Backup/restore | **6-hour PITR** + 1 manual snapshot |
| Egress | 5 GB/mo |
| Pooling (PgBouncer) | included, up to 10,000 connections |

### Deno Deploy Free
| Item | Value |
|---|---|
| Requests | **1,000,000 / month** |
| CPU time | **15 CPU-hours / month** (no 50 ms/req cap like Classic) |
| Egress | 20 GB/mo |
| KV | 1 GiB |
| Deployments / domains | 20 active; 50 custom domains |
| RAM / size | 512 MB / deploy ≤ 1 GB |
| `Deno.cron` | yes (scheduler in code) |
| WebSockets | yes (`Deno.upgradeWebSocket`, configurable idle timeout) |
| Secrets | yes |

## What tips you into paying (keep in mind)

**Neon → $19:** compute >100 CU-hrs/mo (a DB that rarely sleeps — the main silent
trigger), data >0.5 GB/project (writes start failing), >10 branches, >5 GB egress.
**Deno Deploy → $20:** >1M requests, **>15 CPU-hours**, >20 GB egress — a chatty
**WebSocket** burns CPU-hours + egress fastest.

€0 strategy: infrequent `Deno.cron` (hourly, no more), feed via polling, add chat
WS later and watch CPU-hours; data is tiny → 0.5 GB is comfortable.

## Realtime on free — caveat

WebSockets on Deno Deploy free **work, but not as a dedicated always-on server**:
instances are serverless and may be recycled → **the client must auto-reconnect**,
and shared state lives in Neon/Deno KV, not memory. Fine for alpha/hobby load. If
you later need guaranteed persistent WS with big fan-out, move WS out. **Note:**
right now (waitlist/alpha) realtime isn't needed at all — that's €0 by definition;
build WS only for the app phase.

## Portability (preserved)

- **Neon** = plain Postgres → `DATABASE_URL` works anywhere; moving = swap the string.
- **Deno Deploy** = standard Deno + Web APIs (WebCrypto, fetch, WebSocket,
  Deno.cron) → the same code runs on self-hosted Deno or in a container.
- **Bunny** Storage behind an abstraction (↔ R2/B2 by config).
- Runs locally: `deno task dev` + local Postgres (or a Neon branch).

## Advantages of third-party (managed) services

Why Neon/Deno Deploy and not just your own server:

- **Zero ops.** Backups/PITR, upgrades, security patches, HA, monitoring — on the
  provider. You don't admin Postgres or patch an OS.
- **Truly €0 when idle.** Scale-to-zero: while alpha sleeps there's no charge at
  all. Your own server ticks 24/7 regardless.
- **Managed Postgres out of the box:** point-in-time recovery, **branches =
  dev/uat/prod** by copy, connection pooling — things you'd hand-build on a box.
- **Edge/latency.** Deno Deploy runs closer to users; a single VPS is one region.
- **Smaller security surface.** No OS/ports/TLS certs under your responsibility.
- **Fast start and elasticity.** Nothing to stand up/harden; the provider absorbs
  traffic spikes without manual resizing.
- **Pay as you grow.** Free tier covers alpha; money only when you actually scale.

Downsides (honestly): free-tier limits and "don't hit the cap" anxiety, multiple
vendors, less control, vendor quirks, serverless-WS is more fragile than a
persistent server, data sits at a provider.

## Alternative: your own cheap VPS (~€4/mo)

You're right — for this you can grab one cheap box (Hetzner CX22 ~€3.8, ARM CAX11
~€4, Netcup, etc.) and run **everything on it with Docker**: your API + Postgres +
realtime WS + cron, all 3 envs in one place.

**VPS pros:**
- **One box, one predictable bill** (~€4–5/mo), no free-tier limits or CU-hour anxiety.
- **Full control** — any software, your versions, your settings.
- **A real always-on Postgres and a persistent WS server** (long-lived
  connections, no serverless reconnect fragility).
- **Pure Docker = maximum portability**, zero vendor lock-in.
- **Realtime with no caveats** — holds connections as long as needed.

**VPS cons:**
- **Not €0** — ~€4–5/mo always (but predictable and tiny).
- **All ops are yours:** OS updates, security, TLS, backups, monitoring, Postgres admin.
- **Single point of failure** — one box, no HA/autoscale.
- **You do and test backups yourself** (`pg_dump`/provider snapshots).

### Free managed vs cheap VPS — when which

| Criterion | Free (Neon+Deno+Bunny) | Cheap VPS |
|---|---|---|
| Price | **€0** (within limits) | ~€4–5/mo fixed |
| Ops | provider | **all you** |
| DB backups | managed PITR | DIY |
| Realtime WS | more fragile (serverless) | **solid (always-on)** |
| Limits | CU-hours/CPU-hours/egress | just the box's hardware |
| Portability | high | **maximum (pure Docker)** |
| Scale/HA | elastic, edge | manual, 1 region |
| Start | faster | provision/harden a box |

**How to choose:**
- Want literally €0 and don't mind watching limits → **free managed**.
- OK with ~€4/mo for full control, honest realtime, and "everything in one Docker,
  no vendors" → **VPS**. Especially if realtime chat becomes the core — a
  persistent WS server on a box beats serverless free.
- **Hybrid (often best):** VPS for API+realtime+cron, and **Postgres on Neon free**
  (so you don't hand-build managed backups/branches). ~€4/mo and minimal data ops.

> Both use **the same portable image** — start on free managed, hit limits or want
> reliable WS → move to a VPS with the same `docker run`. The choice isn't a lock.

## Phased plan + checklists

### Phase 0 — decisions
- [ ] Hosting: **free managed** (Neon+Deno) vs **cheap VPS** vs **hybrid**
      (VPS + Neon) — see the comparison section above
- [ ] Accounts: Neon, Deno Deploy (console.deno.com), Resend (have it)
- [ ] Neon: 1 project + `dev`/`uat`/`prod` branches (within the 10-branch limit)
      **or** 3 projects
- [ ] Freeze the API endpoint list (from landing/panel/functions)

### Phase 1 — backend skeleton (local, Deno)
- [ ] Deno project: router (Hono/oak), `deno.json`, `dev`/`deploy` tasks
- [ ] Config via env only: `DATABASE_URL`, `JWT_SECRET`, `RESEND_API_KEY`,
      `VAPID_*`, `BUNNY_STORAGE_*`
- [ ] DB driver: **`@neondatabase/serverless`** (HTTP, cold-start-friendly) or
      pooled string (`-pooler`)
- [ ] CORS for landing/panel domains; health endpoint
- [ ] `docker-compose`/`deno task dev` + local Postgres for offline dev

### Phase 2 — DB and migrations
- [ ] Schema: the 5 current tables + `posts` (feed) + `messages` (chat, `expires_at`)
- [ ] Run `db/migrations/*` on dev/uat/prod branches (adapt
      `deploy/apply-migrations-cloud.sh` to the Neon URL)
- [ ] Authorization instead of RLS: checks in route code (or enable Postgres RLS —
      Neon supports it)
- [ ] Connect via the **pooled** endpoint (serverless churn)

### Phase 3 — port the existing pieces
- [ ] `invite-panel-user` → route
- [ ] `send-waitlist-welcome` → route (Resend)
- [ ] JWT gateway → session middleware (WebCrypto ES256/HS256)
- [ ] magic-link: issue token + email (Resend) + verify → session JWT
- [ ] web-push (VAPID): sign/encrypt via WebCrypto (verify the lib runs on Deno)

### Phase 4 — ephemera and realtime
- [ ] `Deno.cron` (hourly): `DELETE ... WHERE expires_at < now()` + lazy read filter
- [ ] Feed via a polling endpoint (cheap on CPU/requests)
- [ ] Chat via `Deno.upgradeWebSocket`; client auto-reconnect; state in Neon
- [ ] Watch Deno CPU-hours and Neon CU-hours (metrics)

### Phase 5 — deploy and cutover
- [ ] Deno Deploy: dev/uat/prod projects/envs, secrets, custom domains (`api.*`)
- [ ] Repoint `api.*`/landing + panel config: dev → uat → prod
- [ ] e2e: `run-landing-tests.sh`, `run-panel-tests.sh`
- [ ] Smoke: waitlist submit, panel magic-link login, web-push
- [ ] Tear down Supabase projects after confirmation

### "Stay at €0" checklist
- [ ] Neon: data < 0.5 GB/project; compute < 100 CU-hrs (don't over-run cron/WS)
- [ ] Deno: < 1M requests, **< 15 CPU-hours**, < 20 GB egress/mo
- [ ] `Deno.cron` no more than hourly; enable WS deliberately and monitor CPU
- [ ] Bunny: add no new products; watch remaining credit (CDN/Storage traffic)
- [ ] Set alerts on Neon/Deno limits before you hit paid

### Backups checklist
- [ ] Neon PITR (6 h) on for the prod branch; periodic `pg_dump` to Bunny Storage
      as a safety net + a tested restore
- [ ] Prod data isolated (own branch/project), not shared with dev/uat

## Bottom line

Neon (Postgres, backups, branches, scale-to-zero) + Deno Deploy (API, auth,
web-push, cron, WS) + Bunny (CDN/Storage, already paid) = **€0 over credit** at
alpha, no Supabase, portable. The only "watch duties": keep `Deno.cron`
infrequent, don't bloat WS, and watch Neon CU-hours — then you won't slip into paid.

If you want full control and solid always-on realtime — a **cheap VPS** (~€4/mo)
runs the same image (or hybrid: VPS + Neon-free for the DB). Same Docker → the
choice isn't a lock; move either way with `docker run`.

*Free-tier figures — 2026-07-15 from official Neon/Deno pricing; next-gen Deno is
still evolving, re-verify at deploy.*
