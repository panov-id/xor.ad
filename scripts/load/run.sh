#!/usr/bin/env bash
# One load run against the local shared node: observe.sh in the background, the
# bots in a container on the node's docker network (nothing installed on the
# host), then analyze.py. Output: testing/load/<timestamp>/ (gitignored).
#
#   scripts/load/run.sh                                         # ladder 10,30,60,100,150 x 150 s
#   STEPS=2 STEP_SECONDS=30 scripts/load/run.sh                 # the smoke: 2 bots, 30 s
#   NODE_URL=http://localhost:4173 ...                          # through the page's proxy instead
#
# Needs the stand up (scripts/up-local.sh sosed). Refuses while scripts/up-local.sh is
# running (it rebuilds the stand), unless LOAD_FORCE=1; the e2e stacks (web-e2e-*) have
# their own containers and do not touch the live stand. CORPUS_DIR holds corpus-*.jsonl,
# topics.jsonl and offers.jsonl. DRIVERS (default 3) containers drive the bots: they
# register every bot first (warm-up, not measured), meet at a barrier, then climb the ladder.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
steps="${STEPS:-10,30,60,100,150}"; step_s="${STEP_SECONDS:-150}"; drivers="${DRIVERS:-3}"
net="${NET:-xor-local-sosed_default}"; node_url="${NODE_URL:-http://xor-local-sosed-node-1:8080}"
corpus="${CORPUS_DIR:-/tmp/claude-1000/-home-eugene-panov-Projects-panov-id-xor-ad/3bfd7900-0a5a-4caa-b52b-b28e235cdbd4/scratchpad/load}"
neighbro_key="ak_pub_loadneighbro0001"
if [ "${LOAD_FORCE:-0}" != 1 ] && pgrep -f "^(/bin/)?bash (\./)?(.*/)?scripts/up-local\.sh" >/dev/null; then
  echo "run.sh: scripts/up-local.sh is running and rebuilds the stand; not loading it. LOAD_FORCE=1 overrides." >&2; exit 2
fi
ls "$corpus"/corpus-*.jsonl >/dev/null 2>&1 || { echo "run.sh: no corpus-*.jsonl in $corpus (CORPUS_DIR)" >&2; exit 2; }
docker network inspect "$net" >/dev/null 2>&1 || { echo "run.sh: network $net is not there; scripts/up-local.sh sosed first" >&2; exit 2; }
out="$root/testing/load/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$out"; chmod 777 "$out"
# neighbro's half of the bots needs a neighbro key in the shared node's database (the brand comes from the key).
docker exec xor-local-sosed-postgres-1 psql -U relay relay_test -qAt -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$neighbro_key', 'neighbro', '{}') ON CONFLICT DO NOTHING" >/dev/null \
  || { echo "run.sh: could not add the neighbro key" >&2; exit 2; }
"$root/scripts/load/observe.sh" "$out" 5 >"$out/observe.log" 2>&1 &
obs=$!
cleanup() { touch "$out/observe.stop"; wait "$obs" 2>/dev/null; }
trap cleanup EXIT
trap 'exit 130' INT TERM
echo "run.sh: out=$out steps=$steps x ${step_s}s base=$node_url"
pids=(); ipoff=$((RANDOM % 254))
for ((k = 0; k < drivers; k++)); do
  docker run --rm --name "load-bots-$$-$k" --network "$net" --user "$(id -u):$(id -g)" \
    -v "$root":/repo:ro -v "$out":/out -v "$corpus":/corpus:ro -w /repo node:24.21.0-alpine \
    node --experimental-transform-types --no-warnings scripts/load/bots.mjs \
      --out /out --driver "$k" --drivers "$drivers" --ip-offset "$ipoff" --base "$node_url" --corpus /corpus \
      --steps "$steps" --step-seconds "$step_s" --key-neighbro "$neighbro_key" ${EXTRA_BOT_ARGS:-} &
  pids+=($!)
done
trap 'for ((k = 0; k < drivers; k++)); do docker rm -f "load-bots-$$-$k" >/dev/null 2>&1; done; exit 130' INT TERM
rc=0
for p in "${pids[@]}"; do wait "$p"; r=$?; [ "$r" -gt "$rc" ] && rc=$r; done

cleanup; trap - EXIT
python3 -I "$root/scripts/load/analyze.py" "$out"
exit $rc
