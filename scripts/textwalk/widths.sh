#!/usr/bin/env bash
# The text walk at every width the product must hold (owner, 11.10.2026): phone,
# tablet, desktop, wide, ultrawide — for both brands. Stands first: scripts/up-local.sh.
#   scripts/textwalk/widths.sh <out-dir>
# Prints one summary line per brand×width: steps, failed steps, layout faults.
set -uo pipefail
d="$(cd "$(dirname "$0")" && pwd)"
out="${1:?out dir}"; mkdir -p "$out"
for stand in sosed=http://localhost:4173 neighbro=http://localhost:4183; do
  brand="${stand%%=*}"; url="${stand#*=}"
  for w in 393 768 1440 2560 3440; do
    f="$out/$brand-$w.txt"
    # Each walk registers people from one address; the node allows 10 identities an hour per address
    # (relay/node/src/lib/rate_limit.ts IDENTITY_CREATE_LIMITS) and keeps the hits in rate_limit_hits,
    # read back when it starts — so ten walks in a row met 429 even after a restart (11.10.2026).
    # This stand's own count is emptied and its node restarted to forget the copy in memory; the
    # people already registered stay.
    docker exec "xor-local-$brand-postgres-1" psql -qAt -U relay -d relay_test -c "DELETE FROM rate_limit_hits" >/dev/null
    docker restart "xor-local-$brand-node-1" >/dev/null
    for _ in $(seq 60); do [ "$(docker inspect -f '{{.State.Health.Status}}' "xor-local-$brand-node-1")" = healthy ] && break; sleep 1; done
    WALK_STABLE=1 WALK_WIDTH="$w" bash "$d/run.sh" "$url" >"$f" 2>&1
    grep -q 'WALK END' "$f" || { echo "$brand $w: walk broken — $(head -c 200 "$f")"; continue; }
    printf '%-9s %5s  steps=%s failed=%s sideways=%s past-edge=%s small-taps=%s\n' "$brand" "$w" \
      "$(grep -c '^## ' "$f")" "$(grep -c 'STEP FAILED' "$f")" "$(grep -c SIDEWAYS "$f")" \
      "$(grep -c PAST-EDGE "$f")" "$(grep -c SMALL-TAPS "$f")"
  done
done
