# edge-nodes — release & promotion flow

**Principle: build the release once, promote the exact same image dev → uat →
prod.** What was tested is what ships — byte for byte. No rebuild per environment.

## Flow

```
local ──test── dev branch ──CI──▶ dev env (sha image, auto)
                                     │  smoke + manual click-through
                                     ▼
                          merge dev → main
                                     │  tag vX.Y.Z (+ GitHub Release notes)
                                     ▼
                       CI builds release image :vX.Y.Z (once) ──▶ ghcr
                                     │
                                     ▼  deploy the SAME :vX.Y.Z
                                   uat env
                                     │  smoke + manual click-through
                                     ▼  manual approval (prod gate)
                                   prod env   ← same :vX.Y.Z, no rebuild
```

1. **Develop locally** — `local/` stand (`docker compose up`).
2. **Test locally** — `cd node && deno test` + `bash test/integration.sh`.
3. **Push to `dev`** → CI runs tests, builds `edge-node:<sha>` / `edge-caddy:<sha>`,
   auto-deploys **dev** (sha image — fast iteration, not a formal release).
4. **Verify dev** — post-deploy smoke (auto) + manual click-through.
5. **Merge `dev` → `main`** when happy.
6. **Cut the release** — push a **manual semver tag `vX.Y.Z`** (or a GitHub
   Release). CI builds `edge-node:vX.Y.Z` / `edge-caddy:vX.Y.Z` **once** → ghcr.
7. **Deploy `:vX.Y.Z` to uat.**
8. **Verify uat** — post-deploy smoke + manual click-through.
9. **Promote the same `:vX.Y.Z` to prod** — behind a **manual approval**
   (GitHub Environment protection). No rebuild.

## Rules

- **Immutable version tags.** Releases are pinned by `:vX.Y.Z`, never `:latest`.
  Each env's inventory pins the tag it runs.
- **Post-deploy smoke per env.** After a deploy: hit the deployed `/health`, then
  a synthetic `POST /waitlist` to a test address (dev/local land it in Mailpit).
- **Prod gate.** The wizard refuses to deploy a public (prod) box without
  `--confirm-prod`. (A GitHub Environment *approval* would need a self-hosted
  runner on the whitelisted admin host, since boxes are IP-locked and GitHub
  runners can't reach them.)
- **Rollback = redeploy the previous `:vX.Y.Z`** on the affected env (one command).
- **Release notes** on each GitHub Release.

## Environment ↔ artifact

| Env | Artifact | Trigger | Gate |
|-----|----------|---------|------|
| dev | `:<sha>` (dev branch) | push to `dev` | auto |
| uat | `:vX.Y.Z` (release) | deploy the tag | after dev green |
| prod | **same** `:vX.Y.Z` | promote the tag | manual approve |

## Implementation status

Regimen agreed 2026-07-16. **Done:** CI tag-builds (`:<sha>` + `:<branch>` on
push, `:vX.Y.Z` on a `v*` tag; no `:latest`); per-env `image_tag` pinning in the
inventory (`render` uses `<repo>:<tag>`); prod deploy guard (`--confirm-prod`);
post-deploy smoke (`test/smoke.sh`). **Open:** true GitHub-Environment approval
would need a self-hosted runner on the admin host (boxes are IP-whitelisted).
