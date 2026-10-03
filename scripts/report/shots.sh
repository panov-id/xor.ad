#!/usr/bin/env bash
# Screenshots of the faces for the report, taken now from the LOCAL stand built
# from this tree — never from production, which runs an older image and shows
# none of the branch's work.
#   relay/local (node rebuilt from relay/node) :62080
#   docker-compose.gateway.yml (both landings from ../sosed.place, ../neighbro.place) :8080
#   docker-compose.panel.yml (panel dev server from ./panel) :62173
# The stands are left running: they are the local stand, not throwaway ones.
set -euo pipefail
# The runner image is built on demand, as scripts/design/brand-sheets.sh does:
# a disk clean-up takes it with the rest.
docker image inspect panel-tests-runner >/dev/null 2>&1 || docker build -q -t panel-tests-runner "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/panel/tests" >/dev/null
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="$(cd "$H/../.." && pwd)"
W="${REPORT_WORK:?set REPORT_WORK}"
mkdir -p "$W/shots" "$W/data"

# relay/local bind-mounts ./data; made here, or Docker makes it root-owned in a
# fresh worktree and the node (uid 1000) can store nothing — no users, no waitlist.
mkdir -p "$R/relay/local/data"
(cd "$R/relay/local" && docker compose up -d --build --wait node) > "$W/data/stand.log" 2>&1
# The gateway and the panel carry fixed container names; a worktree's compose
# project would collide with the ones the main checkout already runs. Those are
# reused as they stand (the panel's tree is named in shots.stand below).
running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }
for pair in gateway:xor-ad-gateway panel:xorad-panel-dev-1; do
  f="${pair%%:*}"; name="${pair#*:}"
  if running "$name"; then
    echo "shots: $name already running, reused" >> "$W/data/stand.log"
  else
    docker compose -f "$R/docker-compose.$f.yml" up -d >> "$W/data/stand.log" 2>&1
  fi
done

wait_for() { # url [host header]
  for _ in $(seq 1 180); do
    curl -fsS -o /dev/null ${2:+-H "Host: $2"} "$1" && return 0
    sleep 1
  done
  echo "shots: $1 ${2:-} did not answer in 180 s" >&2
  return 1
}
wait_for http://localhost:62080/health
wait_for http://localhost:8080/ sosed.place
wait_for http://localhost:8080/ neighbro.place
wait_for http://localhost:62173/
# The node reads the role from the user record, not from the token, so the admin
# the panel is shot as has to exist on the stand. Idempotent: the route writes
# the record over whatever was there.
bash "$R/scripts/create-panel-user-local.sh" test-admin@xor.ad admin >> "$W/data/stand.log" 2>&1

echo "$(git -C "$R" rev-parse --abbrev-ref HEAD) $(git -C "$R" rev-parse --short HEAD)" > "$W/data/shots.stand"
timeout 300 docker run --rm --network host -v "$H/shots.mjs":/tests/shots.mjs:ro -v "$W/shots":/out -w /tests \
  --entrypoint node panel-tests-runner:latest shots.mjs
