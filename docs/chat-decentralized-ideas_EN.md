# Chat: decentralized node pool — ideas (starting point)

> Status: **brainstorm, not a decision.** Captured chat/app ideas so there's a
> starting point later. The landing is built separately and now (see `sosed.place`,
> Bunny + Resend). This is about the future chat — which will live in its **own
> repository**.

## The idea in a sentence

The chat backend is **not one vendor but a decentralized, geo-distributed pool of
servers**. Some nodes are our own VPSs across regions; plus **anyone can spin up a
node and contribute their compute** to the pool. A **load balancer** routes each
user to the nearest live node. All of it is **secure by default**.

## Captured requirements (raw)

1. **Geo pool of VPSs** across regions (decentralization, proximity, resilience).
2. **Load balancer** — route to the nearest/live node.
3. **Community nodes** — third parties can run a node and add capacity.
4. **Security** — especially since some nodes are **untrusted** (other people's).

## Key principle (because of community nodes)

If strangers run nodes, **nodes cannot be trusted with content**. Therefore:

- **E2E encryption**: a node sees only **ciphertext**, holds no keys.
- A node = **transport/relay + WS fan-out**, not a plaintext store.
- **Metadata minimization** (who-talks-to-whom, geolocation) — nodes shouldn't
  collect it in the clear either.

This flips the architecture: nodes are "dumb and untrusted," all privacy lives in
the client + cryptography, not in server hardening.

## Node roles (draft)

- **Core nodes (trusted, ours):** coordination, room/neighborhood directory,
  invite-key issue/rotation, anti-spam/moderation hooks, source of truth for
  membership. Few, ours.
- **Relay nodes (community, untrusted):** hold WebSocket connections and forward
  a room's encrypted messages; store ephemera briefly (TTL ~2h) as ciphertext.
  Many, other people's.

## What runs on a node

- WS server: holds room/neighborhood participants' connections.
- Fan-out: got an encrypted message → broadcast to room subscribers.
- Ephemeral store: message buffer with `expires_at` (~2h), ciphertext only.
- Health/metrics for the balancer.

## Data and ephemerality

- Messages **live ~2h and fade** — a great fit for distribution: nodes need only a
  short buffer, no durable long-term storage.
- Durable truth (accounts, membership, balance) lives on **core**, not on
  community nodes.
- Open: fully in-memory per node vs a shared layer; room replication across nodes
  for resilience.

## Load balancing / routing

- **Geo-DNS/steering** (e.g. Bunny DNS geo-steering or CDN ingress) → nearest region.
- **Health checks** → dead nodes drop out of rotation.
- **Sticky for WS**: a room's connections stay on one node (else fan-out breaks) —
  a "room → node" binding (consistent hashing?).
- Failover: if a room's node dies — re-elect a node, clients reconnect.

## Discovery / node registration

- How a community node joins: registration, attestation, gossip/list.
- Liveness/performance checks before sending traffic.
- Ability to evict a "bad" node from rotation.

## Security (the main thing)

- **E2E** (per-room/neighborhood keys; forward secrecy).
- A node **can't read/forge** messages (only relays ciphertext).
- **Metadata minimization** (route without revealing who-with-whom/geo).
- **Sybil resistance**: a stranger mustn't flood the pool with fake nodes to
  collect/drop traffic; node reputation/attestation.
- **DoS/abuse**: rate limits, isolation, per-node caps.
- **Node isolation**: a compromised community node doesn't take down the network
  or leak private data.

## Incentives to run a node

- Why would a stranger run one? Tie it to the app's internal economy
  (balance/bonuses/referrals — already on the roadmap): reward for contributed
  capacity/uptime. Design the mechanics carefully (anti-abuse first).

## Bunny's role

- Bunny as a **geo balancer/ingress** in front of the pool (DNS geo-steering, WS
  via CDN, health routing) — optional, but it fits and is already in the stack.

## Open questions (resolve later)

- Crypto protocol: roll our own E2E vs adopt one (e.g. MLS/Signal-like) for groups/rooms.
- Ephemera storage model on relay nodes and room replication.
- Exact "room → node" scheme and failover without dropping a live chat.
- Attestation and reputation of community nodes; sybil defense.
- Moderation under E2E (client-side/reports, since the server can't see content).
- Node economy: reward vs abuse.
- What stays on core vs what goes to community.

---

*This is an idea capture, not an architecture. When we get to the chat, expand a
prototype from here and resolve the open questions.*
