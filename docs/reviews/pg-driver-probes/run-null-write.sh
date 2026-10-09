#!/usr/bin/env bash
# Run only test/db_null_write.test.ts (branch worktree-par-W15-NC) against a throwaway
# Postgres, with a chosen Deno image. Usage: run-null-write.sh <deno-image> [node-dir]
set -euo pipefail
image=${1:-denoland/deno:alpine-2.1.4}
here="$(cd "$(dirname "$0")" && pwd)"
node=${2:-$here/tree/relay/node}
repo=~/Projects/panov-id/xor.ad
if [ ! -d "$here/tree" ]; then
  git -C "$repo" worktree add -q --detach "$here/tree" worktree-par-W15-NC
fi
net="nc-net-$$"; db="nc-db-$$"; url="postgres://relay:test@postgres:5432/relay_test"
cleanup() { docker rm -fv "$db" >/dev/null 2>&1 || true; docker network rm "$net" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM
docker network create "$net" >/dev/null
docker run -d --name "$db" --network "$net" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test postgres:16-alpine >/dev/null
for _ in $(seq 40); do docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && break; sleep 0.5; done
echo "== image $image"
docker run --rm --network "$net" -e DATABASE_URL="$url" -v "$node":/node -w /node "$image" deno --version 2>/dev/null | head -1
docker run --rm --network "$net" -e DATABASE_URL="$url" -v "$node":/node -w /node "$image" \
  deno run --allow-env --allow-net --allow-read tools/migrate_db.ts >/dev/null
timeout 120 docker run --rm --network "$net" -e DATABASE_URL="$url" -v "$node":/node -w /node "$image" \
  deno test --allow-env --allow-net --allow-read --allow-write test/db_null_write.test.ts \
  > "$here/last.log" 2>&1 || true
sed 's/\x1b\[[0-9;]*m//g' "$here/last.log" | grep -E "^error|Error|at nextWrite|connection.js|passed \|" | head -8
echo "(полный вывод: $here/last.log)"
