#!/usr/bin/env bash
# The terminal's text walk (K10, 11.10.2026): a node of its own, as in
# scripts/run-depth-live-ui.sh, then depth/ink/main.ts with DEPTH_PLAIN=1 under a pty
# for each person, all at the same time on the same node. No screenshots: the capture
# is the text stream, read with read.py.
#
#   [WALK_LANG=en_US.UTF-8] scripts/textwalk/depth/run.sh <out dir> <steps.json> [<steps.json> …]
#   python3 scripts/textwalk/depth/read.py <out dir>/<steps name>.txt
#
# Steps files: see drive.mjs; the pair used for the K10 report is anya.json + boris.json.
# Nothing touches the host or the shared local stands; the stand is labelled with this
# run's PID and removed on exit.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
out="$(mkdir -p "$1" && cd "$1" && pwd)"; shift
img=xor-textwalk-depth:24.21.0
docker image inspect "$img" >/dev/null 2>&1 || docker build -q -t "$img" "$here" >/dev/null
deno="denoland/deno:alpine-2.1.4"; pg_image="postgres:16.13-alpine"
label="textwalk-depth=$$"; network="tw-depth-net-$$"; db="tw-depth-db-$$"; node="tw-depth-node-$$"
database_url="postgres://relay:test@postgres:5432/relay_test"; key_id="ak_pub_textwalkdepth0001"
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
cleanup() { docker rm -fv "$node" "$db" >/dev/null 2>&1; docker network rm "$network" >/dev/null 2>&1; }
trap cleanup EXIT INT TERM
docker network create --label "$label" "$network" >/dev/null
docker run -d --label "$label" --name "$db" --network "$network" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test "$pg_image" >/dev/null
for _ in $(seq 40); do docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && break; sleep 0.5; done
# shellcheck disable=SC2086
docker run --rm --network "$network" -e DATABASE_URL="$database_url" $cache -v "$root/relay/node":/node -w /node "$deno" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null || { echo "migrations failed" >&2; exit 1; }
docker exec "$db" psql -q -U relay -d relay_test -c \
  "INSERT INTO api_keys (id, brand, origins) VALUES ('$key_id', 'sosed', '{}') ON CONFLICT DO NOTHING" >/dev/null
# shellcheck disable=SC2086
docker run -d --label "$label" --name "$node" --network "$network" --network-alias node $cache \
  -e DATABASE_URL="$database_url" -e VAULT_SHARE_KEY=textwalk-vault-key -e STORAGE_TRANSPORT=fs -e STORAGE_DIR=/tmp/data \
  -e MAIL_TRANSPORT=none -e NODE_ENV_NAME=test -e NODE_ID=textwalk -e ALLOWED_ORIGINS="" -e ORIGIN_TOKEN=textwalk-origin \
  -v "$root/relay/node":/node -w /node "$deno" deno run --allow-env --allow-net --allow-read --allow-write src/main.ts >/dev/null
for _ in $(seq 60); do docker run --rm --network "$network" curlimages/curl:8.10.1 -sf http://node:8080/health >/dev/null 2>&1 && break; sleep 1; done
lock_hash="$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
mods="-v depth-node-modules-$lock_hash:/repo/depth/node_modules"
# shellcheck disable=SC2086
timeout 300 docker run --rm -v "$root":/repo $mods -w /repo/depth node:24.21.0-alpine \
  sh -c '[ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund && touch node_modules/.lock-ok; }' >/dev/null
for steps in "$@"; do
  name="$(basename "$steps" .json)"; cp "$steps" "$out/$name.json"
  # shellcheck disable=SC2086
  docker run --rm --label "$label" --network "$network" $mods -e DEPTH_PLAIN=1 -e LANG="${WALK_LANG:-ru_RU.UTF-8}" \
    -e DEPTH_NODE_URL=http://node:8080 -e DEPTH_API_KEY="$key_id" -e DEPTH_ORIGIN_TOKEN=textwalk-origin \
    -v "$root":/repo:ro -v "$here":/walk:ro -v "$out":/out -w /repo/depth "$img" \
    node /walk/drive.mjs "/out/$name.json" "/out/$name.txt" > "$out/$name.log" 2>&1 &
done
wait
for steps in "$@"; do name="$(basename "$steps" .json)"; echo "$name: $(wc -c < "$out/$name.txt" 2>/dev/null || echo 0) bytes → $out/$name.txt"; done
