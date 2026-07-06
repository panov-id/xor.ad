# Deployment (runbook)

Production architecture: **frontends** (2 landings + panel build) on **Bunny CDN** (one Storage+Pull Zone per domain), **backend** on **Supabase Cloud** (Postgres/Auth/Realtime/Storage/Edge Functions). There's no nginx gateway in prod — frontends talk to Supabase Cloud directly (CORS), so the Supabase URL/key are parametrized per environment.

The pattern is adapted from `noisen-app/infrastructure`.

## Three environments (dev / UAT / prod)

**One shared Supabase** for now (split into 3 projects later). Each landing talks to its own `api.*` (a Bunny Pull Zone proxying to Supabase); the panel talks to Supabase directly. Separated on the surface, one database underneath.

| Environment | Branch/trigger | landing | api (proxy → Supabase) | panel |
|-------------|----------------|---------|------------------------|-------|
| **dev** | push to `dev` | dev.sosed.panov.id / dev.neighbro.panov.id | api.dev.sosed.panov.id / api.dev.neighbro.panov.id | dev.xor.panov.id |
| **UAT** | push/merge to `main` → auto-tag | uat.sosed.panov.id / uat.neighbro.panov.id | api.uat.sosed.panov.id / api.uat.neighbro.panov.id | uat.xor.panov.id |
| **prod** | manual run with a chosen tag | sosed.place / neighbro.place | api.sosed.place / api.neighbro.place | xor.panov.id |

> The `api.*` proxy zones: in the Bunny panel, disable caching and set **Origin Host Header = `<ref>.supabase.co`** (or Supabase won't route). The panel talks to Supabase directly (it has auth/functions). Realtime (websockets) does not go through the proxy.

### Promotion flow

1. Work on `dev` → every push deploys to **dev** (`Deploy dev`).
2. Merge `dev` → `main` → the `Deploy UAT` workflow cuts an **auto tag** `vYYYY.MM.DD-<sha>`, pushes it, and deploys that tag to **UAT**.
3. Verify UAT. If good, manually run `Deploy prod` (Actions → Run workflow) and **specify the release tag** → deploy to **prod**.

### CI/CD (GitHub Actions, one workflow set per repo)

- **sosed.place / neighbro.place** — deploy their landing: `deploy-dev.yml`, `deploy-uat.yml` (auto-tag on `main`), `deploy-prod.yml` (dispatch with a tag). No build — static.
- **xor.ad** — reusable `_deploy.yml` (panel build + migrations + edge functions), called from `deploy-dev/uat/prod.yml`.

### Secrets (GitHub Environments: `dev`, `uat`, `production`)

In each repo, create three Environments and put per-environment secrets in them:

- **Landings (sosed/neighbro):** `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`, `BUNNY_PULL_ZONE_ID`, `BUNNY_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- **xor.ad (panel+backend):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `BUNNY_PANEL_STORAGE_ZONE`, `BUNNY_PANEL_STORAGE_API_KEY`, `BUNNY_PANEL_PULL_ZONE_ID`, `BUNNY_API_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `PANEL_URL`.

Setting all of this by hand across 3 repos × 3 environments is tedious — there's a helper:

```bash
cp deploy/github-secrets.example.json deploy/github-secrets.json
# fill in github_token and the values for every repo/env
deploy/set-github-secrets.sh   # creates the Environments and uploads secrets via the GitHub API
```

`deploy/github-secrets.json` is gitignored. The token needs Environments (write) + Secrets (write) on each repo. Empty values are skipped, so you can fill it in incrementally.

### Wizard (per environment)

One interactive command brings up an environment: Bunny zones+hostnames for both landings and the panel, Supabase migrations, and that environment's GitHub secrets.

```bash
deploy/wizard.sh
# prompts for: environment (dev/uat/prod), Bunny API key, Supabase token, project ref, GitHub token
```

Idempotent. Prints the DNS records at the end. Enable SSL for the hostnames in the Bunny panel manually. Start with `dev`.

Below is the manual deploy via the same scripts (for running/debugging a single environment locally).

## Prerequisites (you do these — I can't create accounts/keys)

1. **Bunny.net:** account, Account API Key (Account → API Key). Three Storage Zones + Pull Zones for `sosed.place`, `neighbro.place`, `panel.xor.ad`. Attach a custom hostname to each Pull Zone and enable TLS (Bunny issues Let's Encrypt).
2. **Supabase:** a Management API token (Account → Access Tokens). The project can be created by the script below or ahead of time in the dashboard.
3. **DNS:** records for `sosed.place`, `neighbro.place`, `panel.xor.ad` → CNAME to the matching Pull Zones.
4. **SMTP for panel login:** magic-link sign-in needs SMTP in Supabase Auth (e.g. Resend). Without it nobody can log in — as a stopgap, generate a sign-in link via the Admin API (see `scripts/bootstrap-admin.sh` locally, same idea for cloud).

## Configuration

```bash
cp deploy/.env.deploy.example deploy/.env.deploy
# fill in: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, BUNNY_API_KEY,
# and three BUNNY_<TARGET>_STORAGE_ZONE / _STORAGE_KEY / _PULL_ZONE_ID,
# plus PANEL_URL / SOSED_URL / NEIGHBRO_URL.
```

`deploy/.env.deploy` is gitignored (real secrets).

## Backend: Supabase Cloud

```bash
deploy/setup-supabase-cloud.sh       # create/find project, write URL+keys into .env.deploy
deploy/apply-migrations-cloud.sh     # db/migrations/*.sql via the Management API
deploy/deploy-functions-cloud.sh     # invite-panel-user Edge Function + SITE_URL secret
deploy/bootstrap-admin-cloud.sh ev.panov@gmail.com   # first panel admin
```

Then in the Supabase Dashboard → Authentication:
- **Site URL** = `PANEL_URL` (e.g. `https://panel.xor.ad`).
- **Redirect URLs** — add `PANEL_URL`.
- **SMTP** — connect a provider (Resend), otherwise magic links aren't sent.

## Frontend: panel (Vite build)

```bash
cp panel/.env.production.example panel/.env.production
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (from deploy/.env.deploy)
```

## Deploy to Bunny

```bash
deploy/deploy-all.sh          # build panel + push all three targets
# or one at a time:
deploy/build-panel.sh
deploy/deploy-cdn.sh sosed
deploy/deploy-cdn.sh neighbro
deploy/deploy-cdn.sh panel
```

For the landings, `config.js` is generated at deploy time to point at Supabase Cloud (the committed `config.js` stays local same-origin). The panel is built with the prod URL from `.env.production`.

## SPA fallback for the panel (important)

The panel is an SPA with client-side routing (react-router). In the panel's Bunny Pull Zone, enable **Error Pages → 404 → `/index.html` with status 200** (or an Origin/Edge Rule), otherwise a direct hit on `/waitlist` returns 404.

## Post-deploy smoke test

1. Open `https://sosed.place` and `https://neighbro.place`, submit an email to the waitlist → success, and the row appears in Supabase (`waitlist`).
2. Open `https://panel.xor.ad` → sign in as admin (magic link once SMTP is set up), see the waitlist and panel users.

## Rollback

Bunny keeps only the last uploaded set. Rollback = deploy a previous commit: `git checkout <prev> && deploy/deploy-cdn.sh <target>`. The backend is forward-only migrations; rolling back needs a reverse migration.

## Open questions

- SMTP provider not chosen (Resend deferred) — without it, panel login only works via an Admin-API link.
- The infrastructure (3 Supabase projects, 9 Bunny zones, subdomains, DNS/TLS, GitHub Environments + secrets) has to be provisioned by hand — the scripts and workflows are ready, but you create the resources.
- Bunny Shield (rate limit) and Cloudflare Turnstile (captcha) are for the post-publishing flow, not part of this deploy.
