#!/usr/bin/env bash
# The terminal's screens against a live node: a stand of its own, the same way
# scripts/run-depth-tests.sh builds one for the core. Nothing touches the host
# and nothing touches the shared local stand.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# --breaks: each break below is put into the node's source, the suite is run
# on a stand of its own, and it must go red; then the file is put back. As in
# scripts/run-e2e-paths.sh (T10): the copy is restored by an EXIT trap, which
# INT, TERM and HUP reach, and a copy also lies in an ignored folder, so the
# next run undoes a break a kill -9 left behind.
#   file | the line to find | the line put instead
BREAKS=(
  "relay/node/src/routes/chats.ts|route(\"POST\", \"/chats/:id/rekey\", (c) => rekey(c.req, c.params.id));|// BROKEN by run-depth-live-ui: no rekey reaches the node"
)
pending="$root/testing/results/.break-pending-depth-live-ui"
# The inner run under a break is told so, or it would undo the break it runs on.
. "$root/scripts/lib/breaks.sh"
[ -n "${DEPTH_LIVE_UI_UNDER_BREAK:-}" ] || breaks_undo_left "$pending"
if [ "${1:-}" = "--breaks" ]; then
  set +e
  broken=""
  restore() { [ -n "$broken" ] && cp "$pending/orig" "$broken" && rm -rf "$pending"; broken=""; }
  trap restore EXIT
  trap 'exit 130' INT; trap 'exit 143' TERM; trap 'exit 129' HUP
  failed=0; total=0
  for row in "${BREAKS[@]}"; do
    IFS='|' read -r file match instead <<<"$row"
    total=$((total + 1)); target="$root/$file"
    if [ "$(grep -cF -- "$match" "$target")" != 1 ]; then
      failed=$((failed + 1)); echo "  ✗ поломка не встала: «$match» в $file"; continue
    fi
    mkdir -p "$pending"; cp "$target" "$pending/orig"; printf '%s' "$target" >"$pending/file"; broken="$target"
    MATCH="$match" INSTEAD="$instead" python3 - "$target" <<'EOF'
import os, sys
p = sys.argv[1]
lines = open(p).read().split("\n")
lines = [os.environ["INSTEAD"] if os.environ["MATCH"] in l else l for l in lines]
open(p, "w").write("\n".join(lines))
EOF
    log="$(mktemp)"
    DEPTH_LIVE_UI_UNDER_BREAK=1 bash "$0" >"$log" 2>&1; code=$?
    restore
    # Caught only on a FAIL line of live.node-test.ts (W10-G1).
    breaks_judge "$file" "$code" "$log" '^FAIL ' || failed=$((failed + 1))
    rm -f "$log"
  done
  echo "поломок поймано $((total - failed)) из $total"
  [ "$failed" = 0 ]; exit
fi
deno="denoland/deno:alpine-2.1.4"
node_image="node:24.21.0-alpine"
pg_image="postgres:16.13-alpine"
label_key="depth-live-ui"
label="$label_key=$$"  # уникален: сметка по общему ярлыку убивала стенд соседнего прогона
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
network="depth-ui-net-$$"; db="depth-ui-db-$$"; node="depth-ui-node-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"
key_id="ak_pub_depthuitest00001"

cleanup() { docker rm -fv "$node" "$db" >/dev/null 2>&1 || true; docker network rm "$network" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
# Leftovers of a run killed hard (SIGKILL skips the trap), and only those — as
# scripts/run-depth-tests.sh does since A7. The sweep used to look for this
# run's own label, which nothing can carry yet at the start, so a killed run's
# stand stayed for good (26.09.2026). A run is alive while its PID is a process
# running this script: `ps`, not `kill -0`, which fails with EPERM on another
# user's live run; the command line catches a reused PID.
alive() { ps -p "$1" -o args= 2>/dev/null | grep -q 'run-depth-live-ui\.sh'; }
docker ps -a --filter "label=$label_key" --format "{{.ID}} {{.Label \"$label_key\"}}" |
  while read -r id pid; do alive "$pid" || docker rm -fv "$id" >/dev/null 2>&1 || true; done
docker network ls --filter "label=$label_key" --format "{{.ID}} {{.Label \"$label_key\"}}" |
  while read -r id pid; do alive "$pid" || docker network rm "$id" >/dev/null 2>&1 || true; done

docker network create --label "$label" "$network" >/dev/null
docker run -d --label "$label" --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test "$pg_image" >/dev/null
ready() { docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1; }
for _ in $(seq 40); do ready && break; sleep 0.5; done
ready || { echo "postgres did not become ready" >&2; docker logs "$db" 2>&1 | tail -20 >&2; exit 1; }

# shellcheck disable=SC2086
docker run --rm --network "$network" -e DATABASE_URL="$database_url" $cache \
  -v "$root/relay/node":/node -w /node "$deno" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null
docker exec "$db" psql -q -U relay -d relay_test -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null

# shellcheck disable=SC2086
docker run -d --label "$label" --name "$node" --network "$network" --network-alias node $cache \
  -e DATABASE_URL="$database_url" -e VAULT_SHARE_KEY=depth-ui-vault-key \
  -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/tmp/data -e MAIL_TRANSPORT=none \
  -e NODE_ENV_NAME=test -e NODE_ID=depth-ui -e ALLOWED_ORIGINS="" -e ORIGIN_TOKEN=depth-ui-origin \
  -v "$root/relay/node":/node -w /node "$deno" \
  deno run --allow-env --allow-net --allow-read --allow-write src/main.ts >/dev/null
up() { docker run --rm --network "$network" curlimages/curl:8.10.1 -sf http://node:8080/health >/dev/null 2>&1; }
for _ in $(seq 60); do up && break; sleep 1; done
up || { echo "the node did not come up" >&2; docker logs "$node" 2>&1 | tail -20 >&2; exit 1; }

# Dependencies live in a Docker volume named after the lockfile, and are
# installed once per lockfile: `npm ci` wipes node_modules, so two runs sharing
# one volume tore each other's tree apart — measured 22.09.2026, both runs died
# with ENOTEMPTY. A marker inside the volume says the tree matches this lock.
lock_hash="$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
mods="-v depth-node-modules-$lock_hash:/repo/depth/node_modules"
# shellcheck disable=SC2086
timeout 300 docker run --rm -v "$root":/repo $mods -w /repo/depth "$node_image" \
  sh -c '[ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund && touch node_modules/.lock-ok; }' >/dev/null
status=0
# shellcheck disable=SC2086
# Labelled too: after a kill -9 it stays attached to this run's network, and
# the next start could remove neither it nor the network without the label.
timeout 600 docker run --rm --label "$label" --network "$network" $mods \
  -e DEPTH_NODE_URL=http://node:8080 -e DEPTH_API_KEY="$key_id" -e DEPTH_DATABASE_URL="$database_url" \
  -e DEPTH_ORIGIN_TOKEN=depth-ui-origin \
  -v "$root":/repo -w /repo/depth "$node_image" \
  node --experimental-transform-types ink/live.node-test.ts || status=$?
if [ "$status" -ne 0 ]; then echo "── node log (tail) ──" >&2; docker logs "$node" 2>&1 | tail -30 >&2; fi
exit "$status"
