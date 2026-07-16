# edge-nodes

A decentralized pool of identical Deno nodes across several VPS providers/regions.
**dev + uat run multi-stand on shared boxes and are PRIVATE** (reachable only from
whitelisted IPs); **prod** runs on its own boxes and is public (geo-steered via
Bunny DNS). v1 serves the landing backend (waitlist, client-error, welcome email);
a stubbed WS-relay slot keeps the node chat-ready.

> Prep layer — the live landing stays on its current backend until cutover.

## Layout

```
edge-nodes/
  node/          identical Deno node image (routes: health · waitlist · client-error; chat slot)
  caddy/         Caddy image with the Bunny DNS module (TLS via ACME DNS-01)
  wizard/        Python pool wizard (Docker launchpad) — generates each box's
                 docker-compose.yml + Caddyfile + per-env .env from the inventory
```

## Environments & access

| Env | Where | Access | TLS | SSH |
|-----|-------|--------|-----|-----|
| **dev** | shared boxes (multi-stand) | private — 443+22 from `whitelist_ips` only | DNS-01 | key-only, no root, whitelist |
| **uat** | same boxes (own stack) | private — whitelist | DNS-01 | same |
| **prod** | its own boxes | public 443 + geo-steered `api.pool` | DNS-01 | same |

Each box runs one node container per env plus a shared Caddy that routes by
hostname `<box>-<env>.<dns_zone>` (e.g. `n1-dev.pool.panov.id`). Private envs use
ACME **DNS-01 via Bunny**, so no public port 80 is needed and the firewall can
stay locked down.

**Logs & mail (per box, behind the whitelist):** **Dozzle** at
`logs-<box>.<zone>` (live container logs in the browser); **Mailpit** at
`mail-<box>.<zone>` for envs with `mail = "mailpit"` (catches welcome emails
instead of sending — dev uses this, uat/prod send via Resend).

For local dev, `local/` is a self-contained stand (node + Mailpit + Dozzle,
fs storage) — `cd local && docker compose up`; see `local/README.md`.

## Node — v1 endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness/readiness |
| `POST /waitlist` | validate → dedup+store in Bunny Storage → welcome via Resend |
| `POST /client-error` | fire-and-forget client error sink |
| `GET /chat` | placeholder → `501` until the chat lands |

Stateless: the only durable state is in **Bunny Storage** (`waitlist/<env>/<hash>.json`).
Identical image everywhere; only the per-env `.env` differs.

## Wizard

Runs in Docker (nothing on the host). Copy `wizard/inventory.example.toml` →
`inventory.toml`; secrets go in `secrets.env` (`export SECRETS_ENV=…`).

```bash
cd wizard
./run.sh status                 # boxes + their env stacks
./run.sh up --node n1           # provision? → dns → configure (all env stacks on the box)
./run.sh deploy                 # rolling: re-sync + rebuild each box, verify /health
./run.sh pool                   # CUTOVER (prod only): add to the geo-steered api.pool
```
Commands: `status` · `provision` · `configure` · `dns` · `pool` · `deploy` · `up`.
Box mode (inventory): `provision` (create the VM via provider API — Hetzner/Vultr/DO)
or `configure` (a box you made by hand — Oracle/GCP free VMs: paste `ssh_host`).

Secrets (wizard env): `BUNNY_API_KEY`, `BUNNY_STORAGE_ZONE/KEY`, `RESEND_API_KEY`,
`WELCOME_FROM?`, `HETZNER_TOKEN`/`VULTR_API_KEY`/`DIGITALOCEAN_TOKEN`, `SSH_PUBLIC_KEY`.

## Build, test, CI

Node + Caddy images build in CI (`.github/workflows/edge-nodes.yml`) and push to
`ghcr.io/panov-id/edge-node` / `edge-caddy`; boxes `docker compose pull` them (no
on-box build — keeps 1 GB free VMs happy). Build locally with
`scripts/build-push.sh` (needs a `GITHUB_TOKEN`; make the packages public once).

Tests: `cd node && deno test` (unit — email/dedup/welcome across 16 langs) and
`bash test/integration.sh` (spins the local stand and asserts
waitlist → fs storage + Mailpit catch + dedup). CI runs both on every
`edge-nodes/**` change.

## Security

- **Firewall default-deny.** `configure` opens only 22 (from `ssh_whitelist` + the
  IP it connects from) and 443 (from each private env's `whitelist_ips`; public
  envs open 443 to the world). Everything else closed. Port 80 never opened.
- **SSH hardened:** `PasswordAuthentication no`, `PermitRootLogin no`, key-only —
  use a passphrase-protected key.
- **TLS:** DNS-01 via Bunny, so certs issue with ports locked down.
- Chat threat model (untrusted community relays → E2E) — see
  `../docs/chat-decentralized-ideas_EN.md`.

## Status

Node functional (typechecks, `/health` 200). Wizard implements the multi-stand
private model: `provision` (Hetzner/Vultr/DO), `dns` (per-env Bunny records),
`configure` (ssh hardening + whitelist firewall + generated compose/Caddyfile +
DNS-01 TLS + all env stacks), `deploy` (rolling), `pool` (prod cutover), `up`.
Remaining: a real run against live boxes/tokens; then uat/prod. Live landing
untouched until cutover.
