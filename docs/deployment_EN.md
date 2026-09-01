# Deployment (runbook)

Rewritten 2026-07-29 for the current architecture. Until then this document
described the Supabase Cloud era: that backend is out of the path, and with it
went `deploy/*-cloud.sh`, `deploy/wizard.sh` and `deploy/deploy-cdn.sh`.

## Where things live

```
sosed.place / neighbro.place      static on Bunny CDN (a Storage + Pull Zone per domain)
xor.panov.id                      the panel (a Vite build) on its own zone
api.<face>                        the relay node on our own boxes, behind Caddy
   └─ Postgres beside the node    control state only (keys, brands, quotas)
   └─ Bunny Storage               data (leads, page views, logs) and database dumps
```

The landings and the panel are static: built in CI, uploaded to a zone.
Everything dynamic goes to the **relay node**, which has its own topology and
its own release rules: `relay/SPEC_EN.md`, `relay/RELEASE_EN.md`,
`relay/ARCHITECTURE_EN.md`.

## Three environments

The environment names **differ** between GitHub and the relay — this is not a
typo:

| GitHub Environment | Relay environment | Landings | Panel |
|---|---|---|---|
| `dev` | dev | dev.sosed.panov.id / dev.neighbro.panov.id | dev.xor.panov.id |
| `uat` | **staging** | uat.sosed.panov.id / uat.neighbro.panov.id | uat.xor.panov.id |
| `production` | prod | sosed.place / neighbro.place | xor.panov.id |

The `uat` ↔ `staging` pairing is stated in one place — the input description in
`.github/workflows/mint-publishable-key.yml`.

## Branch flow

The rule: **`dayN` → `dev` → `main`.**

1. A day's work happens on its own `dayN` branch, cut from the previous one. It
   gets no upstream — a branch tracks only its own remote ref of the same name.
2. What is ready merges into `dev` → the push deploys landings and panel to
   **dev**.
3. `dev` → `main` → the `Deploy UAT` workflow cuts a **dated tag**
   `vYYYY.MM.DD-<sha7>`, pushes it, and deploys **that tag** to uat.
4. Production is manual only: Actions → `Deploy prod` → Run workflow, with the
   `ref` field set to the tag already exercised on uat.

Production takes a **tag, not a branch**: what was reviewed on uat is what
ships, with no rebuild from "main as it is now". The relay node follows the same
principle with its own images — `relay/RELEASE_EN.md`.

## CI/CD

**Landings (`sosed.place`, `neighbro.place`)** — three workflows per repository,
no build step, only page generation and upload:

| Workflow | Trigger | What it does |
|---|---|---|
| `deploy-dev.yml` | push to `dev` | `deploy/deploy-landing.sh` with `LANDING_ENV=dev` |
| `deploy-uat.yml` | push to `main` | cuts `vYYYY.MM.DD-<sha7>` and deploys that tag to uat |
| `deploy-prod.yml` | manual, with a tag | the same script with `LANDING_ENV=prod` |

**Panel (`xor.ad`)** — `deploy-dev/uat/prod.yml` call the shared `_deploy.yml`:
`npm ci && npm run build` in `panel/` with `VITE_RELAY_API_URL`, then
`deploy/deploy-panel-ci.sh` into the panel's zone.

**Node (`xor.ad`)** — `relay.yml`: tests and image builds on a push to any
branch and on a `v*` tag, scoped to `relay/**`. Deploying the node is the
wizard's job, not CI's.

**Keys** — `mint-publishable-key.yml`: mints a brand's publishable key in a
chosen environment, so the zone password never leaves GitHub.

## Secrets (GitHub Environments)

Three Environments per repository (`dev`, `uat`, `production`), with
per-environment values.

**Landings:** `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`,
`BUNNY_PULL_ZONE_ID`, `BUNNY_API_KEY`, `RELAY_API_URL`,
`RELAY_PUBLISHABLE_KEY`. In `production` only: `ANALYTICS_ID` (GA4) and
`SEARCH_CONSOLE_TOKEN`. On dev and uat `ANALYTICS_ID` is deliberately empty — no
counter, hence no consent banner. `SEARCH_CONSOLE_TOKEN` is not actually needed:
the domains verify by a DNS TXT record rather than a meta tag.

**Panel (`xor.ad`):** `VITE_RELAY_API_URL`, `BUNNY_PANEL_STORAGE_ZONE`,
`BUNNY_PANEL_STORAGE_API_KEY`, `BUNNY_PANEL_PULL_ZONE_ID`, `BUNNY_API_KEY`.

Setting 3 repositories × 3 environments by hand is slow — there is a helper:

```bash
cp deploy/github-secrets.example.json deploy/github-secrets.json
# fill in github_token and the values for every repo/env
deploy/set-github-secrets.sh   # creates the Environments and uploads via the API
```

`deploy/github-secrets.json` is gitignored. The token needs Environments (write)
and Secrets (write) on each repository. Empty values are skipped, so it can be
filled in gradually.

## The relay node

Provisioned and rolled by the wizard, not by Actions:

```bash
relay/wizard/run.sh status                            # what sits where
relay/wizard/run.sh --node n1 deploy                  # dev/staging
relay/wizard/run.sh --node p1 --confirm-prod deploy   # prod
```

`--node` and `--confirm-prod` are global flags, so they come **before** the
subcommand. Subcommands: `status`, `provision`, `configure`, `dns`, `pool`,
`deploy`, `up`, `seed-admin` (below).

The production gate: `--confirm-prod` **and** the environment's `image_tag` must
be a published GitHub Release — the wizard checks through the API. Migrations
ship in the image and run before the node starts; the wizard waits for the
database before migrating. The inventory (`relay/wizard/inventory.toml`) is
gitignored — hence open item `A9` in `open-work_EN.md`.

Database backups: `backup-postgres.sh` is laid down on the box by the wizard and
runs from a systemd timer; the restore is exercised by
`scripts/verify-backup-restore.sh`.

**Background work lives inside the node.** The queue is the `jobs` table in the
same database; the worker starts with the node and stays silent without
`DATABASE_URL`. It carries one job today — pruning page-view objects older than
14 days — and that job re-arms itself for tomorrow. The manual
`scripts/prune-pageviews-remote.sh` remains, but only for a run off schedule.

**On an environment that has been running,** fold the existing objects into
daily rows once before the first prune: `tools/backfill_pageview_daily.ts` (no
flags shows the plan, then `--apply`). Otherwise the panel reports more objects
stored than views counted. It rebuilds whole days, so a second run converges
rather than doubling.

### The wizard's secrets: the whole list

`run.sh` passes `secrets.env` as a whole, and the list in the wizard's help and
in `inventory.example.toml` is now **complete**. A partial list is how
`GITHUB_TOKEN` went missing and made production refuse for the wrong reason.

About that one specifically: **`GITHUB_TOKEN` is needed only to deploy a public
environment.** The repository is private, so an unauthenticated release check
gets a 404 and cannot tell "no such release" from "not allowed to look". The
wizard used to say "publish the release first" about a release that was already
published; it now says it could not check, and names why — no token, expired
token, GitHub unreachable.

The token already lives in `deploy/.env.deploy`; it has to be added to the
wizard's `secrets.env` separately — different files for different tools.

Both files carry live keys and belong to their machine rather than to the
repository, so their permissions are a property of the machine and nothing in
git can enforce them: `chmod 600` on each after cloning. `secrets.env` was
already 0600; `.env.deploy` was 0664 — readable by every account on the host —
until 2026-08-13.

A template with every name and no values: `relay/wizard/secrets.env.example`. An
empty value counts as absent — the wizard will say it could not check.

### `pool` requires confirmation

Steering the live DNS record is the one operation that puts a box into the record
**real traffic follows**. It used to be the only production command **without** a
confirmation, while `deploy` — which changes less — always had one:

```bash
relay/wizard/run.sh --node p1 --confirm-prod pool
```

The release gate does not apply here (no image is involved); the confirmation
does.

### The first administrator of a new environment

A new environment is empty, and nobody can sign in to its panel: the operators
route needs a session, a session comes from a magic link, and the link is only
sent to somebody already registered. One command breaks the circle:

```bash
relay/wizard/run.sh --node n1 seed-admin --env staging you@example.com
relay/wizard/run.sh --node p1 --confirm-prod seed-admin --env prod you@example.com
```

The writing is done by the node, not the wizard (`tools/seed_admin.ts`): it
already knows its storage transport, its environment name and how an operator
object is keyed — teaching the wizard any of that would move the problem rather
than solve it.

**The command only works on an empty environment.** If a single operator exists
it refuses with exit code `2` and says why; a second administrator cannot be made
this way, and the panel — where the act is authorised and audited — is where that
belongs. Which is why the command is safe to keep in the image.

A production environment requires `--confirm-prod`, but **not** a published
release, unlike `deploy`: seeding an operator does not change the image, and a
release gate here would mean nothing.

## SPA fallback for the panel

The panel is an SPA with client-side routing. Its Pull Zone needs
**Custom404FilePath → `/index.html`**, or a direct hit on `/waitlist` returns a
404. Set by `deploy/bunny-panel-spa-fallback.sh`.

## The landings' `config.js` cache

`config.js` is generated at deploy time and is **not a hashed asset**, so it must
not be cached like one. The address is versioned (`config.js?v=<build>`), the
page itself lives for minutes, and an edge rule shortens the TTL:
`deploy/bunny-config-cache-rule.sh`. The history is `A8` in `open-work_EN.md`.

## Smoke after a deploy

1. The landing opens, the waitlist form answers "done", and the lead shows up on
   the panel's Waitlist page under the right brand.
2. `config.js` serves the current `RELAY_PUBLISHABLE_KEY`; in production, the
   GA4 id too.
3. The node's `/health` answers; a preflight from the landing's domain allows
   `x-api-key`; a keyless request gets 401 wherever `require_api_key=true`.
4. The panel opens, magic-link sign-in works, Waitlist and the logs are visible.

Items 3–4 are automated in `relay/test/smoke.sh`.

### Bunny Shield

Four prod zones carry it: `xorad-api-prod`, `neighbro-prod`, `sosed-prod`,
`panel-prod`. All four have the WAF **enabled and in log-only mode**
(`wafExecutionMode: 0`), learning until 21 August 2026.

Log-only is deliberate while a zone is learning and a mistake afterwards, because
**nothing switches it automatically** — the API zone finished learning on 12
August and stayed logging, which nobody noticed for two days. So:

    BUNNY_API_KEY=… python3 deploy/shield_state.py

reports every zone and exits non-zero for any that has stopped learning and still
cannot act. Its judgement is a pure function with an offline test
(`deploy/test_shield_state.py`), which is what CI runs; only the fetching needs a
key.

Two things Bunny's API does not offer, checked by trying: **reading the WAF event
log** and anything resembling it (every candidate path answers 404), and there is
no documented switch beyond `PATCH /shield/shield-zone` with `{shieldZoneId,
model}` — which answers `202` with a message that reads like a refusal and
applies the change anyway. Read the log in the Bunny dashboard, and verify any
change here by reading the state back rather than by trusting the response.

## Rollback

- **Landings and panel:** Bunny keeps only the last uploaded set, so a rollback
  is running `Deploy prod` with the previous tag.
- **Node:** deploy the previous `:vX.Y.Z` on the affected environment.
- **The security policy at the edge.** Deploying an older tag recomputes the
  headers from that build, which is the rollback when the policy is wrong *for
  these bytes*. It is not the rollback when the builder itself is wrong — every
  version then produces the same broken policy, and the symptom is a page that
  is blank in production and fine everywhere else. Two ways out, in this order:

      # take the policy off the zone now, and purge so it is visible immediately
      BUNNY_API_KEY=… python3 deploy/apply-edge-headers.py --remove <pull-zone-id>

      # and deploy without touching the rule until the builder is fixed
      SKIP_SECURITY_HEADERS=1 bash deploy/deploy-panel-ci.sh     # or deploy-landing.sh

  `--remove` deletes only the rule the deploy owns, matched by its exact
  description, and leaves anything else on the zone alone.

- **Database:** migrations go forward only; a rollback needs a reverse migration
  or a restore from the nightly dump.

## Open questions

- `A9` — per-environment image tags live outside history (the inventory is
  gitignored).
- Bunny Shield (rate limiting) and a captcha — for the future posting flow, not
  part of this deployment.
- A real 404 page is blocked by Bunny: `ErrorPageCustomCode` applies to origin
  errors, not to a 404 from storage (`D6`).
