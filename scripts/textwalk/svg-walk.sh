#!/usr/bin/env bash
# Every screen of the walk as a vector SVG, both brands at every width (owner 12.10.2026; WALK_WIDTHS narrows it).
# Stands first: scripts/up-local.sh sosed && scripts/up-local.sh neighbro.
#   scripts/textwalk/svg-walk.sh [out-dir]     default testing/walk-svg/<date>
# Each <brand>-<width>/ holds NNN-<who>-<step>.svg, fonts/, index.json and index.html; the text walk is beside it.
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
out="${1:-$root/testing/walk-svg/$(date +%F)}"
mkdir -p "$out"; out="$(cd "$out" && pwd)"   # docker mounts only absolute paths
rc=0
for stand in sosed=http://localhost:4173 neighbro=http://localhost:4183; do
  brand="${stand%%=*}"; url="${stand#*=}"
  for w in ${WALK_WIDTHS:-375 393 768 1024 1440 2560}; do
    d="$out/$brand-$w"; rm -rf "$d"; mkdir -p "$d"
    # the stand's sign-up count emptied and its node restarted, as widths.sh does (ten identities an hour per address)
    docker exec "xor-local-$brand-postgres-1" psql -qAt -v ON_ERROR_STOP=1 -U relay -d relay_test -c "DELETE FROM rate_limit_hits" >/dev/null \
      || { echo "svg-walk.sh: is the stand up? (scripts/up-local.sh $brand)" >&2; exit 3; }
    docker restart "xor-local-$brand-node-1" >/dev/null
    for _ in $(seq 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' "xor-local-$brand-node-1")" = healthy ] && break; sleep 1; done
    WALK_SVG="$d" WALK_WIDTH="$w" WALK_STABLE=1 bash "$root/scripts/textwalk/run.sh" "$url" > "$d/walk.txt" 2>&1 || rc=1
    printf '%-9s %5s  svg=%s  failed=%s\n' "$brand" "$w" "$(ls "$d"/*.svg 2>/dev/null | wc -l)" "$(grep -c 'STEP FAILED' "$d/walk.txt")"
  done
done
exit $rc
