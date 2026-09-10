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
   on is down: the database, storage, mail. **Since 2026-09-08 this case has a
   signal:** read the `database` field in the `/health` body — `ok`, `down` or
   `off`. `down` is this case; go to the database step. `status` itself is always
   `"ok"`: that is liveness, the balancer reads it, and it says nothing about
   whether work is getting done. A separate `GET /ready` answers 503 when the
   database is gone — convenient for checking a node in one command, though the
   CDN does not poll it yet.
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
curl -sS -m 10 -H "authorization: Bearer $METRICS_TOKEN" https://<node host>/metrics
```

The token is required since 2026-09-08: the endpoint handed the brand names, the
request volume per route and per tenant to anybody who knew the path. Without a
valid one the answer is 404 rather than 401 — a 401 would confirm to a stranger
that the path was right. The value is the node's `METRICS_TOKEN`; if the variable
is unset on that node the endpoint is closed to everyone and this step is skipped
— the logs from step 2 are the place to look.

`relay_process_uptime_seconds` is how long the node has been alive. A small
number means it restarted recently: every counter lives in memory and is zeroed
with the process, so "the error counter is zero" and "the node just came up" are
the same reading. `relay_process_start_time_seconds` says when.

`relay_requests_total` by route and status shows whether traffic is arriving and
with which codes. **The route here is a pattern, not a path (since 2026-09-10):**
`POST /admin/dsa-notices/:id/decide`, not a path carrying a real id. The label
used to be built from the raw path, and a public scrape of production carried
three real Article 16 notice ids. The method is normalised by the same rule:
anything outside the known set counts as `<other>`.

**`<unmatched>` is every unrecognised path as one series.** A growing
`GET <unmatched>` with a 404 means somebody is probing, but **which** paths they
probe is no longer visible in the metrics: that is the trade for a series map a
scanner cannot grow. The paths themselves are in the step 2 logs — at `info`, so
on the box only and with a window of about a day; only `warn` and `error` are
copied to storage.

**`relay_metrics_series` and `relay_metrics_writes_dropped_total{metric=…}`** are
the state of the series map itself. The ceiling is 1000 series **per metric
name**; a non-zero dropped counter means some name hit it, and its label names
something unbounded. The `metric` label says which one. It counts **writes**, not
lost series: one hot refused series adds one per request. There is no eviction —
new series under that name simply stop appearing, and the cure is a node restart
or a fix to the label in the code.

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
- **The series map cannot be cleared without restarting the node.** Once a name
  hits the ceiling, new series under it do not appear until a restart — and a
  restart zeroes every counter of the incident too.
- **There is no second node per environment today**
  (`assert_one_box_per_database` in the wizard): traffic cannot be moved to a
  neighbour, because there is no neighbour.
