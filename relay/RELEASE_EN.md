# relay — release & promotion flow

**Principle: build the release once, promote the exact same image dev → staging →
prod.** What was tested is what ships — byte for byte. No rebuild per environment.

## Flow

```
local ──test── dev branch ──CI──▶ :<sha> in ghcr
                                     │  scripts/deploy-relay-dev.sh → dev env
                                     │  smoke + manual click-through
                                     ▼
                          merge dev → main
                                     │  tag vX.Y.Z (+ GitHub Release notes)
                                     ▼
                       CI builds release image :vX.Y.Z (once) ──▶ ghcr
                                     │
                                     ▼  deploy the SAME :vX.Y.Z
                                   staging env
                                     │  smoke + manual click-through
                                     ▼  manual approval (prod gate)
                                   prod env   ← same :vX.Y.Z, no rebuild
```

1. **Develop locally** — `local/` stand (`docker compose up`).
2. **Test locally** — `cd node && deno test` + `bash test/integration.sh`.
3. **Push to `dev`** → CI runs tests and builds `relay-node:<sha>` /
   `relay-caddy:<sha>` (sha image — fast iteration, not a formal release). CI
   does not deploy the node: the boxes accept SSH from the whitelisted admin
   addresses only, and a runner's address is not one.
4. **Roll dev** — `bash scripts/deploy-relay-dev.sh`. It pins `[env.dev].image_tag`
   in `wizard/environments.toml` to that sha, runs `wizard --node n1 deploy`
   (compose sync, pull, migrations from the new image, `up -d`, `/health`), then
   checks that the build being rolled out is the one answering. Commit the pinned
   tag — that file is how history answers which image an environment runs.
5. **Verify dev** — manual click-through. (`test/smoke.sh` posts `/waitlist`
   without a key, so it only fits an environment with `require_api_key = false`.)
6. **Merge `dev` → `main`** when happy.
7. **Cut the release** — push a **manual semver tag `vX.Y.Z`** (or a GitHub
   Release). CI builds `relay-node:vX.Y.Z` / `relay-caddy:vX.Y.Z` **once** → ghcr.
8. **Deploy `:vX.Y.Z` to staging** — pin it in `environments.toml`, then
   `wizard --node n1 deploy`.
9. **Verify staging** — manual click-through.
10. **Promote the same `:vX.Y.Z` to prod** — the wizard requires `--confirm-prod`
   and that `vX.Y.Z` is a **published GitHub Release** (publishing it = the
   approval). No rebuild.

## Rules

- **Immutable version tags.** Releases are pinned by `:vX.Y.Z`, never `:latest`.
  Each env's inventory pins the tag it runs.
- **Post-deploy check per env.** The wizard hits each env's `/health`. Health only
  says a node answers, not that it is the new one, so a deploy also asks for
  something that exists solely in the build being rolled out —
  `scripts/deploy-relay-dev.sh` does that with an unauthenticated
  `POST /v1/client-error` (401 on the new build, 404 on the old).
  `test/smoke.sh` posts `/waitlist` with no key, so it fits only an environment
  with `require_api_key = false` — not dev, staging or prod as they stand.
- **Prod gate = published release.** A prod deploy needs `--confirm-prod` AND the
  env's `image_tag` must be a **published GitHub Release** `vX.Y.Z` (the wizard
  verifies via the API). Publishing the release IS the approval — no infra, no
  runner; an untested/unreleased build simply can't reach prod.
- **Rollback = redeploy the previous `:vX.Y.Z`** on the affected env (one command).
- **Release notes** on each GitHub Release.

## Environment ↔ artifact

| Env | Artifact | Trigger | Gate |
|-----|----------|---------|------|
| dev | `:<sha>` (dev branch) | `scripts/deploy-relay-dev.sh` | CI green |
| staging | `:vX.Y.Z` (release) | deploy the tag | after dev green |
| prod | **same** `:vX.Y.Z` | promote the tag | manual approve |

The panel is the one thing a push does deploy on its own: `deploy-dev.yml` builds
it and ships it to the CDN. The node never rolls by itself.

## Implementation status

Regimen agreed 2026-07-16. **Done:** CI tag-builds (`:<sha>` + `:<branch>` on
push, `:vX.Y.Z` on a `v*` tag; no `:latest`); per-env `image_tag` pinning in
`environments.toml` (`render` uses `<repo>:<tag>`); prod deploy guard
(`--confirm-prod`); one-command dev roll with a liveness check
(`scripts/deploy-relay-dev.sh`); prod gate = `--confirm-prod` + a published
GitHub Release check (`github.py`).

**Not done, and worth knowing:** the dev roll is a command you run, not a step CI
takes — the boxes only accept SSH from the whitelisted admin addresses, so a
hosted runner cannot reach them. A self-hosted runner would close that, and is
the only thing standing between this and a genuine auto-deploy of dev.

`caddy_tag` is still **pool-wide** and lives in the untracked `inventory.toml`, so
one box cannot run a different caddy from another, and `_guard_prod` does not
check it — moving it moves prod's caddy too. Node images are per-env and do not
have this problem.
