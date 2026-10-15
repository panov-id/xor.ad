# Node load test, 15 Oct 2026

Every number comes from the output of `python3 -I scripts/load/analyze.py <dir>` for the two runs (rerun while writing this report). Times are milliseconds node-side (from the node's own log; every call joined: 9229 of 9229 and 35356 of 35356). Client-side is higher by 1–4 ms at p50 and 2–6 ms at p95 (the gap column).

## What was measured

Bots (half on sosed, half on neighbro, through the shared sosed node) register (warm-up, not judged), meet at a barrier and climb a ladder; each step 150 s. The gate: node p95 <= 2 s with 0 errors.

- Run 1, `testing/load/20261015-012213`: 10 -> 30 -> 60 -> 100 -> 150 bots, 5 drivers.
- Run 2, `testing/load/20261015-013730`: 150 -> 250 -> 400 -> 600 bots, 8 drivers.

## Run 1: 10 -> 150 bots

| Step | Bots | Requests | Errors | Refused 404/409/422 | node-side p50 / p95 / max, ms | postgres CPU peak, % | node CPU peak, % | node mem, MiB | load1 peak (8 cores) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 10 | 236 | 0 | 20 | 16 / 27 / 42 | 12.5 | 8.8 | 83 | 7.1 |
| 2 | 30 | 721 | 0 | 32 | 16 / 31 / 62 | 21.8 | 18.0 | 90 | 8.0 |
| 3 | 60 | 1418 | 0 | 72 | 17 / 30 / 97 | 33.4 | 18.0 | 91 | 9.6 |
| 4 | 100 | 2297 | 0 | 107 | 14 / 26 / 75 | 31.3 | 17.9 | 97 | 7.7 |
| 5 | 150 | 3366 | 0 | 115 | 15 / 31 / 106 | 40.6 | 19.8 | 99 | 6.2 |

Main routes, p50/p95/max, ms:
- Step 1 (10): POST /feed 26/42/42; GET /feed 16/27/34; GET /inbox 16/23/36; like 10/24/25
- Step 2 (30): POST /feed 22/54/62; GET /feed 17/31/48; GET /inbox 16/26/49; like 12/24/33
- Step 3 (60): POST /feed 23/52/61; GET /feed 17/30/64; GET /inbox 16/26/64; like 11/29/46; messages 12/97/97
- Step 4 (100): POST /feed 17/36/75; GET /feed 14/27/60; GET /inbox 14/24/47; like 8/21/27
- Step 5 (150): POST /feed 23/49/106; GET /feed 14/29/64; GET /inbox 16/29/78; like 9/34/58; consent 23/76/76

Refusals are only `409 POST /feed/:id/like` (a repeat like); that is the node's answer, not an error. Verdict: 150 bots.

## Run 2: 150 -> 600 bots

| Step | Bots | Requests | Errors | Refused 404/409/422 | node-side p50 / p95 / max, ms | postgres CPU peak, % | node CPU peak, % | node mem, MiB | load1 peak (8 cores) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 150 | 3749 | 0 | 330 | 15 / 29 / 95 | 34.7 | 25.6 | 101 | 13.2 |
| 2 | 250 | 5633 | 0 | 216 | 18 / 40 / 1120 | 56.7 | 31.5 | 105 | 8.7 |
| 3 | 400 | 8795 | 0 | 421 | 20 / 50 / 233 | 111.9 | 52.1 | 106 | 10.0 |
| 4 | 600 | 13288 | 0 | 1460 | 24 / 138 / 844 | 136.3 | 60.0 | 109 | 13.0 |

Main routes, p50/p95/max, ms:
- Step 1 (150): POST /feed 22/45/77; GET /feed 15/27/94; GET /inbox 15/27/95; like 10/26/76
- Step 2 (250): POST /feed 28/65/1120; GET /feed 18/39/358; GET /inbox 18/36/84; like 14/38/856
- Step 3 (400): POST /feed 32/95/193; GET /feed 20/52/233; GET /inbox 20/46/178; like 12/42/118
- Step 4 (600): GET /feed 25/161/844; GET /inbox 24/124/626; like 11/72/426

Refusals are again only `409 POST /feed/:id/like`. Verdict: 600 bots (the top of the ladder, not the node's ceiling).

## What degrades first

Node p95 grows from 29 ms (150 bots) to 40 (250), 50 (400) and 138 (600); at 600 `GET /feed` p95 is 161 ms and `GET /inbox` 124 ms. Over the same steps postgres CPU grows from 34.7 % to 56.7, 111.9 and 136.3 % (more than one core) and node CPU from 25.6 to 60.0 %. Node memory barely moves (101 -> 109 MiB). Postgres CPU is the first to run out. Suspect: the 4-connection pool (`POOL_SIZE = 4`, `relay/node/src/lib/db.ts:37`, line checked): the pg_stat_activity samples showed up to 5 active queries at 400 bots and up to 4 at 600, i.e. active queries reached the pool size. This is NOT VERIFIED: the run did not measure time spent waiting for a free pool connection; the peak of 8 connections in pg_stat_activity includes other clients of the database and I did not split it by source. Lock waits 0 and slow (>200 ms) samples 0 on every step. Errors 0 on all nine steps.

Isolated spikes: at 250 bots `POST /feed` max 1120 ms and `POST /feed/:id/like` max 856 ms against p95 65 and 38 ms; cause not found.

## Host caveats

The stand shares the machine (8 cores) with other work. load1 in run 2 reached 13.2 (steps 1 and 4) and 10.0; analyze.py flagged steps 1–4 of run 2 and steps 2–3 of run 1 as "HOST OVERLOADED": latencies include scheduler waits. Step 3 of run 2 (400 bots) is flagged DRIVER-BOUND: driver event-loop delay p99 69 ms > 50 ms, so that step's client-side numbers are not the node's (node-side stays valid). Run 2 warm-up: a driver loop up to 23.7 s, not judged. `pg_stat_statements` is not available in the database, so there is no per-query breakdown.

## Not covered

- WebSocket chat: not covered; the run is HTTP only.
- Few chats and consents: `POST /chats/:id/messages` has 5 to 84 requests per step, `POST /matches/:id/consent` 0 to 24; at 600 bots the route table shows 5 messages and no consent.
- Shared host and one database for both brands: there is no clean "node alone on a machine" measurement.
- The gate was not pushed to failure: at 600 bots it still held, so the node's ceiling was not found.
- The phrase corpus ran out in run 2 ("corpus exhausted"); 760 of 760 phrases published, and bots publish no more after that.

## How to rerun

You need the stand up (`scripts/up-local.sh sosed`) and a corpus directory (`CORPUS_DIR`, files `corpus-*.jsonl`, `topics.jsonl`, `offers.jsonl`). Run 2:

```
STEPS=150,250,400,600 STEP_SECONDS=150 DRIVERS=8 CORPUS_DIR=<dir> scripts/load/run.sh
python3 -I scripts/load/analyze.py testing/load/<timestamp>
```

Run 1: `STEPS=10,30,60,100,150 STEP_SECONDS=150 DRIVERS=5 scripts/load/run.sh`. Smoke: `STEPS=2 STEP_SECONDS=30 scripts/load/run.sh`. Other variables: `NODE_URL`, `NET`, `LOAD_FORCE=1` (run while `up-local.sh` is running), `EXTRA_BOT_ARGS`. Output goes to `testing/load/` (gitignored). One run at a time: one session per shared node.
