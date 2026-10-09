#!/usr/bin/env bash
# Resilience gate for the node's database layer (W15-NC, task 10): the node's own
# relay/node/src/lib/db.ts, driven through what the database does to it in life.
#
#   1. the node starts while the database is not there yet;
#   2. the database is stopped for 30 s and started again under the running node;
#   3. a storm: 20 writers (queries and transactions) while every backend is
#      killed every 50–250 ms, for 10 s;
#   4. 70 s of quiet, then the same storm again on the same process — the old
#      driver broke a minute after an error it had swallowed.
#
# After each phase, within 60 s: SELECT 1 answers, a transaction commits, a NOTIFY
# on each of the ten channels chat/relay.ts listens on is heard through the
# listen() the node called once at start (relay.ts caches that promise with ??=,
# so the gate does too), and no backend is left "idle in transaction".
#
# Offline: a network and a database of its own, named by PID, no host port, no
# migrations (the gate touches one table it creates). Exit 0 only when every
# phase passes.
#
#   scripts/check-pg-resilience.sh
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
postgres_image="postgres:16-alpine"
network="pg-resil-net-$$"
db="pg-resil-db-$$"
node="pg-resil-node-$$"
work="$(mktemp -d)"
chmod 777 "$work"

cleanup() {
  docker rm -fv "$node" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

ready() { docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
wait_ready() {
  for _ in $(seq 60); do ready && return 0; sleep 0.5; done
  echo "postgres did not become ready" >&2; return 1
}
# The node and this script take turns through files in $work: the node says what
# it needs, the script does it and answers.
wait_for() {
  for _ in $(seq 600); do [ -e "$work/$1" ] && return 0; sleep 0.5; done
  echo "the node never asked for '$1'" >&2; return 1
}
say() { touch "$work/$1"; }

cat >"$work/gate.ts" <<'TS'
import postgres from "npm:postgres@3.4.4";
import * as db from "/node/src/lib/db.ts";

const url = Deno.env.get("DATABASE_URL")!;
const CHANNELS = [
  "session_frozen", "chat_closed", "chat_rekey", "chat_sys", "session_frame",
  "table_event", "chat_game", "seat_left", "chat_extra_like", "chat_message",
];
let uncaught = 0;
globalThis.addEventListener("error", (e) => { uncaught++; e.preventDefault(); console.error("UNCAUGHT", String(e.error)); });
globalThis.addEventListener("unhandledrejection", (e) => { uncaught++; e.preventDefault(); console.error("UNHANDLED", String(e.reason)); });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A step that never returns is a failure of its own (the old driver hung in the
// second storm): say where, instead of letting the outer timeout say nothing.
let step = "start", since = Date.now();
const at = (name: string) => { step = name; since = Date.now(); };
setInterval(() => {
  if (Date.now() - since < 120_000) return;
  console.log(`FAIL ${step}: hung for 120 s`);
  console.log(`uncaught=${uncaught}`);
  Deno.exit(1);
}, 1_000);
const ask = (name: string) => Deno.writeTextFile(`/work/${name}`, "");
async function answered(name: string) {
  while (true) { try { await Deno.stat(`/work/${name}`); return; } catch { await sleep(200); } }
}

// Once, at start, as relay.ts does: the promise is kept whatever it settles to.
const heard = new Map<string, Set<string>>(CHANNELS.map((c) => [c, new Set()]));
const subscribed = CHANNELS.map((c) => db.listen(c, (p) => heard.get(c)!.add(p)));
subscribed.forEach((p) => p.catch(() => {}));

// The gate's own eyes: a fresh connection per look, never the node's pool.
async function look<T>(text: string): Promise<T[]> {
  const sql = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try { return await sql.unsafe(text) as T[]; } finally { await sql.end({ timeout: 1 }).catch(() => {}); }
}

let failures = 0;
async function phase(name: string) {
  const deadline = Date.now() + 60_000;
  const want = `${name}-${Date.now()}`;
  const ok = { select: false, tx: false, channels: new Set<string>(), idleInTx: -1 };
  while (Date.now() < deadline) {
    if (!ok.select) ok.select = await db.queryOrThrow<{ n: number }>("SELECT 1 AS n").then((r) => r[0]?.n === 1, () => false);
    if (!ok.tx) {
      ok.tx = await db.transaction(async (q) => {
        await q("INSERT INTO resil_gate (phase) VALUES ($1)", [name]);
        return true;
      }).then(() => look<{ n: number }>(`SELECT count(*)::int AS n FROM resil_gate WHERE phase = '${name}'`))
        .then((r) => r[0]?.n >= 1, () => false);
    }
    for (const c of CHANNELS) {
      if (heard.get(c)!.has(want)) ok.channels.add(c);
      else await look(`SELECT pg_notify('${c}', '${want}')`).catch(() => {});
    }
    ok.idleInTx = await look<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_stat_activity WHERE state LIKE 'idle in transaction%'",
    ).then((r) => r[0].n, () => -1);
    if (ok.select && ok.tx && ok.channels.size === CHANNELS.length && ok.idleInTx === 0) break;
    await sleep(500);
  }
  const deaf = CHANNELS.filter((c) => !ok.channels.has(c));
  const pass = ok.select && ok.tx && deaf.length === 0 && ok.idleInTx === 0;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}: select=${ok.select} tx=${ok.tx} heard=${ok.channels.size}/${CHANNELS.length}` +
    `${deaf.length ? ` deaf=${deaf.join(",")}` : ""} idle_in_tx=${ok.idleInTx}`);
}

async function storm(name: string) {
  const end = Date.now() + 10_000;
  let kills = 0;
  const writer = async () => {
    while (Date.now() < end) {
      const a = "x".repeat(Math.floor(Math.random() * 2000));
      if (Math.random() < 0.5) await db.query("SELECT length($1::text) AS n", [a]);
      else await db.transaction(async (q) => { await q("INSERT INTO resil_gate (phase) VALUES ($1)", [`${name}:storm`]); }).catch(() => {});
    }
  };
  const killer = async () => {
    while (Date.now() < end) {
      await sleep(50 + Math.random() * 200);
      await look("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid <> pg_backend_pid() AND datname = current_database()")
        .then(() => kills++, () => {});
    }
  };
  await Promise.all([...Array(20)].map(writer).concat([killer()]));
  console.log(`     ${name}: ${kills} kill rounds`);
}

await ask("need-db");
await answered("db-up");
await look("CREATE TABLE IF NOT EXISTS resil_gate (phase text NOT NULL)");
at("start-without-db");
await phase("start-without-db");

await ask("restart-db");
at("restart-30s"); since += 60_000; // the script holds the database down for 30 s of it
// Keep the node busy while the database is gone, the way traffic would.
const busy = (async () => { while (!(await Deno.stat("/work/db-back").then(() => true, () => false))) { await db.query("SELECT 1"); await sleep(250); } })();
await answered("db-back");
await busy;
await phase("restart-30s");

at("storm-1");
await storm("storm-1");
await phase("storm-1");
at("pause-70s");
await sleep(70_000);
at("storm-2");
await storm("storm-2");
await phase("storm-2");

console.log(`uncaught=${uncaught}`);
await db.closePool().catch(() => {});
Deno.exit(failures === 0 && uncaught === 0 ? 0 : 1);
TS

echo "== network $network, node starts with no database"
docker network create "$network" >/dev/null
docker run -d --name "$node" --network "$network" \
  -e DATABASE_URL="postgres://relay:test@postgres:5432/relay_test" \
  -e RELAY_DB_TIMEOUT_MS=5000 \
  -v "$root/relay/node":/node:ro -v "$work":/work -w /node "$image" \
  run --config /node/deno.json --allow-net --allow-env --allow-read --allow-write=/work /work/gate.ts >/dev/null

wait_for need-db
sleep 5 # the node lives without its database for a while before it appears
echo "== database appears"
docker run -d --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test \
  "$postgres_image" >/dev/null
wait_ready
say db-up

wait_for restart-db
echo "== database stopped for 30 s"
docker stop -t 2 "$db" >/dev/null
sleep 30
docker start "$db" >/dev/null
wait_ready
say db-back
echo "== database back; storms follow (≈ 3 min)"

rc=0
timeout 600 docker wait "$node" >"$work/rc" || rc=$?
[ "$rc" = 0 ] && rc="$(cat "$work/rc")"
# One line per distinct failure, counted: a storm can throw the same thing hundreds of times.
docker logs "$node" 2>&1 | grep -E '^(PASS|FAIL|uncaught|     |UNCAUGHT|UNHANDLED|error)' | sort | uniq -c | sort -rn | head -20
echo "== pg resilience: $([ "$rc" = 0 ] && echo GREEN || echo "RED (rc=$rc)")"
exit "$rc"
