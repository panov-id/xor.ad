#!/usr/bin/env bash
# Takes down web stands whose runner died without its trap (SIGKILL, a closed
# terminal; O1/O2/O4, panel 2026-10-03): a project web-<kind>-<PID>, kind one of
# e2e, two, mixed, report, whose PID is
# gone and none of whose containers runs. A stand kept with --keep still runs
# its node and page, and a live run in another worktree has a live PID — both stay.
#
#   scripts/reap-web-stands.sh            reap
#   scripts/reap-web-stands.sh --dry-run  name what would go
set -uo pipefail
docker_cmd="${DOCKER:-docker}"
dry=0; [ "${1:-}" = "--dry-run" ] && dry=1
reaped=0; kept=0
while IFS=$'\t' read -r name status; do
  # Only the stands' own kinds, as prune-web-images.sh names them: a stopped
  # project of someone's own called web-<word>-<number> keeps its volumes (W15-RP).
  [[ "$name" =~ ^web-(e2e|two|mixed|report)-([0-9]+)$ ]] || continue
  pid="${BASH_REMATCH[2]}"
  if kill -0 "$pid" 2>/dev/null || [[ "$status" == *running* ]]; then kept=$((kept + 1)); continue; fi
  if [ "$dry" = 1 ]; then echo "would reap: $name ($status)"; else
    "$docker_cmd" compose -p "$name" down -v --rmi local --remove-orphans >/dev/null 2>&1 \
      && echo "reaped: $name" || echo "could not reap: $name" >&2
  fi
  reaped=$((reaped + 1))
done < <("$docker_cmd" compose ls -a --format json 2>/dev/null \
  | python3 -c 'import json,sys; [print(p["Name"]+"\t"+p["Status"]) for p in json.load(sys.stdin)]')
echo "stands reaped: $reaped, left alive: $kept"
