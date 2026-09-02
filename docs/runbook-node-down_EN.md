# Runbook: the node is not answering

One document for one question: what to do when a pool node stops answering, or
answers wrongly, at three in the morning rather than with a clear head. The order
is cheapest first, and every step says what its outcome means. The Russian half
is `runbook-node-down_RU.md`.

Written 2026-09-02 off a review panel: until then no order of actions existed
anywhere, and `deployment_EN.md` describes a deploy, not an incident.

## What counts as "not answering"

Three different troubles, treated differently:

1. **`/health` does not answer at all** — the node is dead, or the network does
   not reach it.
2. **`/health` answers and nothing works** — the node is alive but what it leans
   on is down: the database, storage, mail.
3. **`/health` answers with the wrong thing** — `image` is not the build that was
   deployed, say: that is a deploy which never arrived, not a node which broke.

## Step 1. Ask the node itself

```bash
curl -sS -m 10 https://<node host>/health | python3 -m json.tool
```

`{"status":"ok", ...}` means the node is alive — go to step 3. No answer at all —
step 2.

What matters in the response besides `status`: `image` (which build is actually
running), `storage` and `storage_transport` (is object storage reachable), `env`
and `node` (is this the node we think it is), `mail`.

**Private environments are IP-whitelisted.** From an address that is not on the
list, dev and staging will not answer while being perfectly healthy — that is the
access list, not an incident. Check them from a whitelisted host.

## Step 2. Read what the container says

The node's logs live **on the box** and never leave it: there is no centralised
shipping (measured 2026-09-02 — neither the wizard's compose nor its
configuration forwards anything). Two ways to read them:

- **The viewer in a browser** that the wizard brings up on every box:
  `https://logs-<box id>.<zone>` (`logs-n1.…`, for instance). It reads the same
  Docker files from a container next door.
- **Over SSH, on the box**: `docker compose -f /opt/relay/compose/docker-compose.yml logs --tail=200 node-<env>`.

The lines are JSON, one per event: `ts`, `level`, `msg`, `node`, `env`. The
`warn` and `error` levels are also copied into object storage
(`server-logs/<env>/…`), so they survive the file rotating; `info` stays on the
box.

**How much is kept.** Every service caps its log at 50 MB across three files
(`max-size`/`max-file`, introduced 2026-09-02). Before that nothing but the disk
bounded it — and the log viewer lives on that same disk, so filling it killed the
node and the only way to look at it together. What that means on call: **beyond
roughly a day there is nothing on the box**, and for an older incident the place
to look is the `warn`/`error` copies in storage.

## Step 3. Ask the metrics

```bash
curl -sS -m 10 https://<node host>/metrics
```

`relay_process_uptime_seconds` is how long the node has been alive. A small
number means it restarted recently: every counter lives in memory and is zeroed
with the process, so "the error counter is zero" and "the node just came up" are
the same reading. `relay_process_start_time_seconds` says when.

`relay_requests_total` by route and status shows whether traffic is arriving and
with which codes.

## Step 4. Bring it up

The node runs with `restart: unless-stopped`, so Docker restarts a crashed
container by itself. If it is still down, on the box:

```bash
cd /opt/relay/compose
docker compose ps                  # what is running at all
docker compose up -d node-<env>    # bring up just that environment
```

**Do not deploy a new build to fix an old one.** A deploy changes two things at
once — the image and the state — and afterwards nobody can say which of them
helped. If the build is the cause, a rollback is a deploy of the previous tag,
deliberately and as its own decision (`deployment_EN.md`).

## Step 5. Prove it is well again

```bash
BASE=https://<node host> relay/test/smoke.sh
```

The smoke test checks `/health` and a live write path. Green closes the
incident; red sends you back to step 2 with fresher logs.

## What this runbook cannot do

Named outright, so nobody hunts at night for something that does not exist:

- **There is no alerting.** Nobody will wake you: a node that fell is discovered
  by someone going to look. That is open work, not forgotten work.
- **There is no centralised log shipping.** Anything that is not `warn`/`error`
  lives on the box only, and only until the file rotates.
- **Metrics do not survive a restart.** There is no history, only a snapshot.
- **There is no second node per environment today**
  (`assert_one_box_per_database` in the wizard): traffic cannot be moved to a
  neighbour, because there is no neighbour.
