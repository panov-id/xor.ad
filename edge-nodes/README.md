# edge-nodes

A decentralized pool of identical Deno nodes across several VPS providers/regions,
fronted by Bunny DNS geo-steering. v1 serves the **landing backend** (waitlist,
client-error sink, welcome email); the structure is **chat-ready** (a stubbed
WS-relay slot) for the future decentralized chat.

> Prep layer. The live landing keeps running on its current backend until the
> pool is ready and verified — cutover is a deliberate, separate step.

## Layout

```
edge-nodes/
  node/          identical Deno image (the node)
    src/main.ts          HTTP server + router
    src/routes/          health · waitlist · client-error
    src/lib/             storage (Bunny) · resend · cors · http · hash
    src/chat/relay.ts    chat WS-relay slot (placeholder, returns 501)
    Dockerfile
  compose/       what runs on each VPS: node + Caddy (auto-TLS)
    docker-compose.yml · Caddyfile · node.env.example
  wizard/        Python pool wizard (runs in a Docker launchpad)
    wizard.py · inventory.example.toml · Dockerfile · run.sh
```

## Node — what it does (v1)

| Endpoint | Purpose |
|---|---|
| `GET /health` | liveness/readiness for the balancer |
| `POST /waitlist` | validate → dedup+store in Bunny Storage → welcome via Resend |
| `POST /client-error` | fire-and-forget client error sink (Bunny Storage) |
| `GET /chat` | placeholder → `501` until the chat lands |

Stateless: the only durable state is in **Bunny Storage** (object per item,
keyed by hashed email → idempotent dedup). Identical image everywhere; only
`node.env` differs.

### Run the node locally
```bash
cd node
BUNNY_STORAGE_ZONE=... BUNNY_STORAGE_KEY=... RESEND_API_KEY=... \
  deno task dev
# GET http://localhost:8080/health
```

## Wizard

Runs in Docker (nothing on the host). Copy `wizard/inventory.example.toml` →
`inventory.toml` and fill it in.
```bash
cd wizard
./run.sh status                 # show the pool
./run.sh up --node dev          # provision? -> configure -> register in Bunny DNS
./run.sh deploy                 # roll the latest node image to all nodes
```
Modes per node (in the inventory): `provision` (create the VPS via provider API)
or `configure` (an existing box you bought — IP+SSH).

## Balancer & cutover

Bunny DNS geo-steers the pool hostname (`api.<face>`) to the nearest healthy node.
During prep, nodes use their own hostnames (`n1.…`, `n2.…`) so the live `api.*`
stays on the current backend. **Cutover** = point `api.sosed.place` /
`api.neighbro.place` at the pool, then flip the landing config.

## Security (baseline)

Per-node firewall (22/80/443), SSH keys only, fail2ban, unattended upgrades;
secrets via env only (never in the image); Caddy TLS on every node. The chat
threat model (untrusted community nodes → E2E, ciphertext-only relays) is in
`../docs/chat-decentralized-ideas_EN.md`.

## Status

Step-1 scaffold: the node is functional; the wizard's provider/SSH/DNS actions
are structured stubs to fill in next.
