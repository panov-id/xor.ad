#!/usr/bin/env bash
# Screenshots of the faces for the report, taken now from the LOCAL stand built
# from this tree — never from production, which runs an older image and shows
# none of the branch's work.
#   relay/local (node rebuilt from relay/node) :62080
#   docker-compose.gateway.yml (both landings from ../sosed.place, ../neighbro.place) :8080
#   docker-compose.panel.yml (panel dev server from ./panel) :62173
# The stands are left running: they are the local stand, not throwaway ones.
set -euo pipefail
H="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="$(cd "$H/../.." && pwd)"
W="${REPORT_WORK:?set REPORT_WORK}"
mkdir -p "$W/shots" "$W/data"

(cd "$R/relay/local" && docker compose up -d --build --wait node) > "$W/data/stand.log" 2>&1
docker compose -f "$R/docker-compose.gateway.yml" up -d >> "$W/data/stand.log" 2>&1
docker compose -f "$R/docker-compose.panel.yml" up -d >> "$W/data/stand.log" 2>&1

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

echo "day58 $(git -C "$R" rev-parse --short HEAD)" > "$W/data/shots.stand"
timeout 300 docker run --rm --network host -v "$H/shots.mjs":/tests/shots.mjs:ro -v "$W/shots":/out -w /tests \
  --entrypoint node panel-tests-runner:latest shots.mjs
