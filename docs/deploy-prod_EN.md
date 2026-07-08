# DEPLOY PROD — checklist (neighbro.place landing)

Prod = real domains. General mechanics in `deployment_EN.md`, dev/uat in `deploy-today_EN.md`.
Focus: the **neighbro.place** face (sosed on hold, panel later).

## 0. Decisions first
- [ ] **Supabase for prod:** the project is currently **shared** across dev/uat. For prod that's a risk: real signups mix with test data, one outage hits everything. Decide: **separate prod project** (recommended) or shared for now.
- [ ] **Canonical domain:** apex `neighbro.place` as primary + `www` → redirect to apex (or vice-versa).
- [ ] **Scope:** neighbro landing only (no sosed/panel).

## 1. Prerequisites
- [ ] GitHub **`production`** environment in the repo (the token can create it now; the wizard also does).
- [ ] `deploy/.env.deploy` already filled (Bunny/Supabase/GitHub/Namecheap).
- [ ] The face is accepted on **UAT**, and there's a release tag (`Deploy UAT` auto-tags on push to `main`).

## 2. Landing content before prod
- [ ] **OG/meta for sharing** (missing today): `<meta name="description">`, `og:title/description/image/url`, `twitter:card`, and a 1200×630 OG image.
- [ ] Footer Terms/Privacy/Rules link to the live `legal.html`.
- [ ] `robots.txt` / favicons / `apple-touch-icon` present (verify).
- [ ] Run **E2E** on UAT (form→backend), confirm green.

## 3. Provision the prod environment
```bash
deploy/run-wizard.sh prod     # Bunny prod zones (site+api.*+panel) + migrations + GitHub production secrets
```
Prints the DNS records. Prod hostnames: `neighbro.place`, `api.neighbro.place`.

## 4. DNS on neighbro.place (Namecheap)
- [ ] **apex** `@ neighbro.place` → **ALIAS** → `neighbro-prod.b-cdn.net` (a CNAME on the root is not allowed!).
- [ ] `www` → CNAME → `neighbro-prod.b-cdn.net` (+ www↔apex redirect as preferred).
- [ ] `api` → CNAME → `neighbro-api-prod.b-cdn.net`.
- Automation: `deploy/namecheap-add.py neighbro.place records.json --apply` (handles ALIAS/CNAME; preserves existing records — check what's on neighbro.place).

## 5. Manual in Bunny
- [ ] **SSL** (Let's Encrypt) on `neighbro.place`, `www.neighbro.place`, `api.neighbro.place`.
- [ ] For `api.neighbro.place` (proxy): **Origin Host Header = `<ref>.supabase.co`**, **WebSockets ON**, cache `CacheControlMaxAgeOverride=0` (can be done via the Bunny API, as on dev).

## 6. Deploy the files
- [ ] Actions → **Deploy prod** (`workflow_dispatch`) → give the **release tag** (e.g. `v2026.07.08-abcdef1`).
  - The deploy checks out that tag, generates `config.js` pointing at `api.neighbro.place` + the prod anon key, uploads to Bunny.

## 7. Verify
- [ ] `https://neighbro.place` loads (green TLS), theme/language/splash OK.
- [ ] Waitlist form: submit → success; row in Supabase (`waitlist`, source `neighbro.place-landing`).
- [ ] `api.neighbro.place/rest/v1/...` routes to Supabase (not a Bunny 404).
- [ ] Legal pages (`/legal.html`) render; footer links live.
- [ ] Mobile: `overflow=0`, footer tidy.

## 8. Post-launch
- [ ] **Rollback:** re-run `Deploy prod` with the previous tag if needed.
- [ ] Watch `client_errors` (logger) for the first hours.
- [ ] Clean test rows in `waitlist` if the Supabase project is shared.

## Open questions / risks
- Shared Supabase in prod (data/uptime) — move prod to its own project.
- Apex via Namecheap ALIAS + Bunny SSL — confirm Bunny issues a cert for the apex.
- SMTP (email) — separate track (`email-smtp.md`); not a blocker for the landing.
