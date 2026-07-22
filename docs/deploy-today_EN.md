# DEPLOY TODAY — dev + uat runbook (landings + panel)

A quick checklist to bring up **dev** and **uat** in one pass. Prod is separate, later.
Full architecture is in `deployment_EN.md`. dev+uat share **one** Supabase project.

## 0. Create first (manual — accounts/keys only)
- [ ] **Bunny.net** — Account API Key (Dashboard → Account → API Key).
- [ ] **Supabase Cloud** — one project (shared dev+uat); **Management token** (Account → Access Tokens) and **project ref** (Settings → API).
- [ ] **GitHub PAT** — Environments + Secrets (write) on `panov-id/{sosed.place, neighbro.place, xor.ad}`.
- [ ] **Namecheap** — Profile → Tools → **enable API Access**; whitelist the host's egress IP (find it: `curl https://api.ipify.org`).

## 1. Config `deploy/.env.deploy` (gitignored)
```bash
cp deploy/.env.deploy.example deploy/.env.deploy
```
Fill the minimum for dev+uat+panel:
```
SUPABASE_ACCESS_TOKEN=      # Supabase Management token
SUPABASE_PROJECT_REF=       # shared project ref
BUNNY_API_KEY=              # Bunny Account API key
GITHUB_TOKEN=               # PAT for the three repos
NAMECHEAP_API_USER=
NAMECHEAP_API_KEY=
NAMECHEAP_USERNAME=         # usually = API_USER
# NAMECHEAP_CLIENT_IP=      # blank = auto-detect
```

## 2. Provision environments (wizard, idempotent, throwaway container)
```bash
deploy/run-wizard.sh dev      # migrations + Bunny zones (site+api.*+panel) + GitHub dev secrets
deploy/run-wizard.sh uat      # same for uat (same Supabase, different zones/hostnames)
```
The wizard prints the DNS records at the end (CNAME → `<zone>.b-cdn.net`).

## 3. DNS on panov.id (Namecheap, safe: getHosts → merge → setHosts)
```bash
deploy/namecheap-dns.sh dev            # dry-run: prints the plan
deploy/namecheap-dns.sh dev --apply    # write
deploy/namecheap-dns.sh uat            # dry-run
deploy/namecheap-dns.sh uat --apply
```
Records (dev; for uat swap `dev`→`uat`):
```
dev.sosed.panov.id        → sosed-dev.b-cdn.net
api.dev.sosed.panov.id    → sosed-api-dev.b-cdn.net
dev.neighbro.panov.id     → neighbro-dev.b-cdn.net
api.dev.neighbro.panov.id → neighbro-api-dev.b-cdn.net
dev.xor.panov.id          → panel-dev.b-cdn.net
```

## 4. Manual in Bunny (not cleanly covered by the API)
- [ ] Enable **SSL** (Let's Encrypt) on every custom hostname (site, api.*, panel).
- [ ] For `api.*` proxy zones: **disable caching**, **Origin Host Header = `<ref>.supabase.co`**, enable **WebSockets** (Pull Zone → General) — for Supabase Realtime.
- [ ] Panel: **SMTP** in Supabase Auth for magic-link (otherwise sign-in only via a bootstrap link; on dev use `deploy/bootstrap-admin-cloud.sh`).

## 5. Deploy the files
CI uploads on push to the environment branch (secrets are already set by the wizard):
```bash
# in each of the 3 repos: fast-forward the dev branch to current code and push
git checkout dev && git merge --ff-only day4 && git push origin dev   # → Deploy dev
```
UAT: merge `dev → main` → auto-tag → `Deploy UAT`.
(No-CI alternative: `deploy/deploy-cdn.sh <sosed|neighbro|panel>` with zone names/keys filled in `.env.deploy`.)

## 6. Verify
- [ ] `getent hosts dev.neighbro.panov.id` — resolves to b-cdn.net.
- [ ] `https://dev.neighbro.panov.id` and `https://dev.sosed.panov.id` load (green TLS).
- [ ] Waitlist: submit an email → success; row appears in Supabase (`waitlist`).
- [ ] `https://dev.xor.panov.id` — panel loads; sign in via magic-link/bootstrap.
- [ ] Repeat for `uat.*`.

## Notes
- Everything is idempotent — re-running the wizard is safe.
- `.env.deploy`, `github-secrets.json` are gitignored — never committed.
- Don't paste secrets in chat — only into `deploy/.env.deploy`.
