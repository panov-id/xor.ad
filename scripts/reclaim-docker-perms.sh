#!/usr/bin/env bash
# Reclaim ownership of Docker-created output dirs. The test/build containers now
# run as the host user (see docker-compose.*-tests.yml `user:` and build-panel.sh
# `--user`), so new runs stay host-owned — but files created before that fix, or
# on another machine, may still be root-owned and make git (and IDEs) choke on
# unremovable files. Run this once to clean them up.
#
# Needs sudo (the stale files belong to root). Idempotent. Supabase Docker
# volumes are intentionally left alone — Postgres/storage own them and chowning
# would break the containers.
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
U="$(id -un)"; G="$(id -gn)"

targets=(
  "testing/screenshots"
  "testing/results"
  "panel/dist"
  "panel/tests/report"
  "panel/node_modules"
)

for rel in "${targets[@]}"; do
  path="$ROOT_DIR/$rel"
  [ -e "$path" ] || continue
  sudo chown -R "$U:$G" "$path"
  echo "chown -> $rel"
done

echo "=== remaining non-$U files (excluding .git and supabase volumes) ==="
find "$ROOT_DIR" \
  -path "$ROOT_DIR/.git" -prune -o \
  -path "$ROOT_DIR/supabase/volumes" -prune -o \
  -not -user "$U" -print 2>/dev/null | grep -v '/\.git/' | head
echo "done"
