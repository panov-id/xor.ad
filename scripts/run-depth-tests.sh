#!/usr/bin/env bash
# Tests of the depth client's core, against a live node of its own.
#
# The core talks HTTP to a node the way the terminal will, so its tests get a
# real one: a throwaway network, a throwaway Postgres, the migrations, and the
# node started from the current sources — not the shared local stand, whose
# state belongs to whoever is using it. A storefront key is written straight
# into the database, because registration asks for one.
#
# The unit tests (sign.test.ts) run in the same pass; they need no node.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --breaks (T28): the suite runs as it is, then once per break below with one
# line of the node or the core changed, and must go red in the named test file
# each time. A suite red with no break is a spoiled run, not a break caught. The
# changed file is restored from its copy on any exit (as run-e2e-paths.sh does,
# T10); the copy lies in the tree, so a run killed with -9 is undone by the next.
#   file | the line to break (fixed string, exactly one) | what stands instead | the test file that must go red
if [ "${1:-}" = "--breaks" ]; then
  breaks=(
    "relay/node/src/routes/inbox.ts|...(next ? { next } : {})|/* BROKEN by run-depth-tests: no next */|inbox_pages.test.ts"
    "depth/core/reconnect.ts|if (code === 1001 || |if (/* BROKEN by run-depth-tests: 1001 */ |reconnect.test.ts"
  )
  pending="$root/depth/.break-pending"
  broken=""
  restore() {
    [ -n "$broken" ] || return 0
    cp "$pending/orig" "$broken" && rm -rf "$pending" && broken=""
  }
  logs="$(mktemp -d)"
  trap 'restore; rm -rf "$logs"' EXIT
  trap 'exit 130' INT; trap 'exit 143' TERM; trap 'exit 129' HUP
  if [ -f "$pending/file" ]; then
    broken="$(cat "$pending/file")"
    echo "  ! прошлый прогон оборван посреди поломки: $broken восстановлен из копии" >&2
    restore
  fi
  if ! bash "$0" >"$logs/clean.log" 2>&1; then
    echo "  ✗ брак прогона: набор красный и без поломки"; tail -5 "$logs/clean.log"; exit 1
  fi
  caught=0
  for row in "${breaks[@]}"; do
    IFS='|' read -r file match instead guard <<<"$row"
    target="$root/$file"
    hits=$(grep -cF -- "$match" "$target" || true)
    if [ "$hits" != 1 ]; then
      printf '  ✗ %-22s поломка не встала: «%s» найдено %s раз, нужно 1\n' "$guard" "$match" "$hits"; continue
    fi
    mkdir -p "$pending"; cp "$target" "$pending/orig"; printf '%s' "$target" >"$pending/file"; broken="$target"
    MATCH="$match" INSTEAD="$instead" python3 - "$target" <<'EOF'
import os, sys
p = sys.argv[1]; s = open(p).read()
open(p, "w").write(s.replace(os.environ["MATCH"], os.environ["INSTEAD"], 1))
EOF
    bash "$0" >"$logs/$guard.log" 2>&1; code=$?
    restore
    if [ "$code" != 0 ] && sed 's/\x1b\[[0-9;]*m//g' "$logs/$guard.log" | grep -qE "=> .*$guard"; then
      caught=$((caught + 1)); printf '  ✓ %-22s красный на поломке %s\n' "$guard" "$file"
    else
      printf '  ✗ %-22s не покраснел на поломке %s (код %s)\n' "$guard" "$file" "$code"
    fi
  done
  echo "поймано $caught из ${#breaks[@]}"
  [ "$caught" = "${#breaks[@]}" ]
  exit $?
fi

image="denoland/deno:alpine-2.1.4"
# Exact, not "16-alpine": a minor version that moves between runs is a test that
# changes under nobody's hand (depth-core panel, 2026-09-21).
pg_image="postgres:16.13-alpine"
# The label carries this run's PID: a shared "depth-test=1" let every start
# sweep away the stand of a run going on in another worktree (26.09.2026).
label_key="depth-test"
label="$label_key=$$"
# One module cache for all three Deno runs and every later one: without it each
# run downloaded the node's and the tests' dependencies afresh.
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
network="depth-test-net-$$"
db="depth-test-db-$$"
node="depth-test-node-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"
key_id="ak_pub_depthcoretest0001"

cleanup() {
  docker rm -fv "$node" "$db" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# Leftovers of a run killed hard (SIGKILL skips the trap), and only those: a
# run is alive while its PID is a process running this script. `ps`, not
# `kill -0` — the latter fails with EPERM on a live run of another user; the
# command line catches a reused PID and the old "depth-test=1" leftovers.
alive() { ps -p "$1" -o args= 2>/dev/null | grep -q 'run-depth-tests\.sh'; }
docker ps -a --filter "label=$label_key" --format "{{.ID}} {{.Label \"$label_key\"}}" |
  while read -r id pid; do alive "$pid" || docker rm -fv "$id" >/dev/null 2>&1 || true; done
docker network ls --filter "label=$label_key" --format "{{.ID}} {{.Label \"$label_key\"}}" |
  while read -r id pid; do alive "$pid" || docker network rm "$id" >/dev/null 2>&1 || true; done

# Types first, as the node's run-relay-tests.sh does: until 29.09.2026 no script
# type-checked depth, and its code was checked only by running it (T23, found
# by 9e on T19). The core's tests import the node's sources, hence the whole
# tree. The Ink screens are not checked here: React ships no types and
# @types/react is not a dependency (T23).
docker run --rm $cache -v "$root":/repo -w /repo/depth "$image" \
  sh -c 'deno check $(find core -name "*.ts")'

docker network create --label "$label" "$network" >/dev/null
docker run -d --label "$label" --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test \
  "$pg_image" >/dev/null
ready() { docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do ready && break; sleep 0.5; done
ready || { echo "postgres did not become ready" >&2; exit 1; }

migrations="$(mktemp)"
# shellcheck disable=SC2086
if ! docker run --rm --network "$network" -e DATABASE_URL="$database_url" $cache \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >"$migrations" 2>&1; then
  echo "migrations failed:" >&2; tail -30 "$migrations" >&2; rm -f "$migrations"; exit 1
fi
rm -f "$migrations"

docker exec "$db" psql -q -U relay -d relay_test -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null

# shellcheck disable=SC2086
docker run -d --label "$label" --name "$node" --network "$network" --network-alias node $cache \
  -e DATABASE_URL="$database_url" -e VAULT_SHARE_KEY=depth-test-vault-key \
  -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/tmp/data -e MAIL_TRANSPORT=none \
  -e NODE_ENV_NAME=test -e NODE_ID=depth-test -e ALLOWED_ORIGINS="" -e ORIGIN_TOKEN=depth-test-origin \
  -v "$root/relay/node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read --allow-write src/main.ts >/dev/null

up() { docker run --rm --network "$network" curlimages/curl:8.10.1 -sf http://node:8080/health >/dev/null 2>&1; }
for _ in $(seq 60); do up && break; sleep 1; done
up || { echo "the node did not come up" >&2; docker logs "$node" 2>&1 | tail -20 >&2; exit 1; }

# A green run with the live tests skipped would prove nothing: they ignore
# themselves when the node's address is missing, so the run must report none
# ignored (depth-core panel, 2026-09-21).
out="$(mktemp)"
status=0
# shellcheck disable=SC2086
docker run --rm --network "$network" $cache \
  -e DEPTH_NODE_URL=http://node:8080 -e DEPTH_API_KEY="$key_id" -e DEPTH_DATABASE_URL="$database_url" -e DEPTH_ORIGIN_TOKEN=depth-test-origin \
  -v "$root":/repo -w /repo "$image" \
  deno test --config depth/deno.json --allow-env --allow-read --allow-net depth/ "$@" 2>&1 | tee "$out" || status=$?
if [ "$status" -eq 0 ] && grep -qE "[1-9][0-9]* ignored" "$out"; then
  echo "tests were skipped — the live ones must run here" >&2; status=1
fi
rm -f "$out"
# A failure against a live node is read in the node's own log first.
if [ "$status" -ne 0 ]; then echo "── node log (tail) ──" >&2; docker logs "$node" 2>&1 | tail -30 >&2; fi
exit "$status"
