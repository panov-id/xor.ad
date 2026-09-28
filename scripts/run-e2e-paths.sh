#!/usr/bin/env bash
# Q7: every end-to-end path in a browser against a live node, one run. Each
# path is one script of scripts/ on its own stand: run-web-two-people.sh <spec>
# for a path in the browser alone, run-web-depth-mixed.sh for the one where
# the second person is in the terminal.
#
#   scripts/run-e2e-paths.sh           every path; exit 1 if any is red
#   scripts/run-e2e-paths.sh --breaks  each path with its own break in the node:
#                                      the spec must go red; exit 1 if one stays green
#
# A path joins by a row in PATHS: its name, the command that runs it (a script
# of scripts/ and its arguments), the file its break edits, the
# line it matches (a fixed string, exactly one line) and the line put in its
# place. A break that matches nothing or more than one line fails the run: a
# break that did not happen would read as a guard that did not catch it.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"

# name | command | file | the line to break | what stands there instead
PATHS=(
  "two-people|run-web-two-people.sh two-people|relay/node/src/routes/matches.ts|(c) => act(c.req, c.params.id, \"consent\")|route(\"POST\", \"/matches/:id/consent\", (c) => act(c.req, c.params.id, \"decline\")); // BROKEN by run-e2e-paths"
  "two-devices|run-web-two-people.sh two-devices|relay/node/src/routes/transfer.ts|recovery_wrapped_key: bytesToBase64url(me.recovery_wrapped_key)|      // BROKEN by run-e2e-paths: the move's ack drops recovery_wrapped_key"
  "mixed-depth|run-web-depth-mixed.sh|relay/node/src/routes/matches.ts|(c) => act(c.req, c.params.id, \"consent\")|route(\"POST\", \"/matches/:id/consent\", (c) => act(c.req, c.params.id, \"decline\")); // BROKEN by run-e2e-paths"
)

mode="${1:-}"
logs="$(mktemp -d)"
failed=0; total=0

for row in "${PATHS[@]}"; do
  IFS='|' read -r spec command file match instead <<<"$row"
  read -r script args <<<"$command"
  total=$((total + 1))
  if [ "$mode" != "--breaks" ]; then
    bash "$here/$script" $args >"$logs/$spec.log" 2>&1
    code=$?
    if [ "$code" = 0 ]; then
      printf '  ✓ %-14s %s\n' "$spec" "$(grep -E '[0-9]+ passed' "$logs/$spec.log" | tail -1 | sed 's/^ *//')"
    else
      failed=$((failed + 1))
      printf '  ✗ %-14s (код %s)\n' "$spec" "$code"
      grep -E '✘|Error:|failed' "$logs/$spec.log" | head -6 | sed 's/^/      | /'
    fi
    continue
  fi

  target="$root/$file"
  hits=$(grep -cF -- "$match" "$target")
  if [ "$hits" != 1 ]; then
    failed=$((failed + 1))
    printf '  ✗ %-14s поломка не встала: «%s» в %s найдено %s раз, нужно 1\n' "$spec" "$match" "$file" "$hits"
    continue
  fi
  cp "$target" "$logs/$spec.orig"
  MATCH="$match" INSTEAD="$instead" python3 - "$target" <<'EOF'
import os, sys
p = sys.argv[1]
lines = open(p).read().split("\n")
lines = [os.environ["INSTEAD"] if os.environ["MATCH"] in l else l for l in lines]
open(p, "w").write("\n".join(lines))
EOF
  bash "$here/$script" $args >"$logs/$spec.log" 2>&1
  code=$?
  cp "$logs/$spec.orig" "$target"
  if ! cmp -s "$logs/$spec.orig" "$target"; then
    echo "  ✗ $file не восстановлен — копия в $logs/$spec.orig" >&2; exit 2
  fi
  if [ "$code" = 0 ]; then
    failed=$((failed + 1))
    printf '  ✗ %-14s остался зелёным с поломкой в %s\n' "$spec" "$file"
  else
    printf '  ✓ %-14s красный: %s\n' "$spec" "$(grep -m1 -E 'Error:' "$logs/$spec.log" | sed 's/^ *//')"
  fi
done

rm -rf "$logs"
label=$([ "$mode" = "--breaks" ] && echo "поломок поймано" || echo "путей зелёных")
echo "$label $((total - failed)) из $total"
[ "$failed" = 0 ]
