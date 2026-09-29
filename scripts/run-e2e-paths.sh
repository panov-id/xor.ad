#!/usr/bin/env bash
# Q7: every end-to-end path in a browser against a live node, one run. Each
# path is one script of scripts/ on its own stand: run-web-two-people.sh <spec>
# for a path in the browser alone, run-web-depth-mixed.sh for the one where
# the second person is in the terminal.
#
#   scripts/run-e2e-paths.sh           every path; exit 1 if any is red
#   scripts/run-e2e-paths.sh --breaks  each path with its own break in the node:
#                                      the spec must go red; exit 1 if one stays green
#   E2E_PATHS_ONLY=<name> ...          one path of PATHS, not all
#
# Under --breaks a path first runs as it is: red already, its red under the
# break would prove nothing, so that is a spoiled run ("брак прогона"), counted
# apart and failing the whole, not a break caught (decline-expire:135 on
# 8077848f was red with no break and read as "caught", 28.09.2026).
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
  "decline-expire|run-web-two-people.sh decline-expire|relay/node/src/lib/chat_sweeper.ts|p.idle_ttl_minutes * interval '1 minute' <= now()|  + p.idle_ttl_minutes * interval '1 minute' <= now() - interval '1 day' /* BROKEN by run-e2e-paths: no conversation's term comes */\`;"
  "two-devices|run-web-two-people.sh two-devices|relay/node/src/routes/transfer.ts|recovery_wrapped_key: bytesToBase64url(me.recovery_wrapped_key)|      // BROKEN by run-e2e-paths: the move's ack drops recovery_wrapped_key"
  "venue-path|run-web-two-people.sh venue-path|relay/node/src/routes/offer_complaints.ts|route(\"POST\", \"/offers/:id/complaints\", (c) => complain(c.req, c.params.id));|// BROKEN by run-e2e-paths: no complaint on a venue's offer reaches the node"
  "offer-complaint|run-web-two-people.sh offer-complaint|relay/node/src/routes/offer_links.ts|route(\"POST\", \"/o/:code/report\", (c) => report(c.req, c.params.code));|// BROKEN by run-e2e-paths: no report of an offer's link reaches the node"
  "mixed-rekey|run-web-depth-mixed.sh mixed-rekey|relay/node/src/routes/chats.ts|SET key_epoch = \$3, ephemeral_public_key = \$4, ephemeral_signature = \$5|          SET key_epoch = key_epoch + 0 * \$3::int, ephemeral_public_key = \$4, ephemeral_signature = \$5 -- BROKEN by run-e2e-paths: the reissue keeps the epoch"
  "mixed-depth|run-web-depth-mixed.sh|relay/node/src/routes/matches.ts|(c) => act(c.req, c.params.id, \"consent\")|route(\"POST\", \"/matches/:id/consent\", (c) => act(c.req, c.params.id, \"decline\")); // BROKEN by run-e2e-paths"
  "moderation-path|run-web-two-people.sh moderation-path|relay/node/src/routes/feed_queue.ts|decide(req, params.id, \"publish\"));|route(\"POST\", \"/admin/feed-queue/:id/publish\", ({ req, params }) => decide(req, params.id, \"refuse\")); // BROKEN by run-e2e-paths"
  "chat-end|run-web-two-people.sh chat|relay/node/src/routes/chats.ts|route(\"DELETE\", \"/chats/:id\", (c) => close(c.req, c.params.id));|// BROKEN by run-e2e-paths: no conversation is ended by hand"
  "decline-undo|run-web-two-people.sh decline|relay/node/src/routes/matches.ts|(c) => act(c.req, c.params.id, \"undo\")|// BROKEN by run-e2e-paths: a declined match is not taken back"
)

mode="${1:-}"
logs="$(mktemp -d)"
# The break in flight: its file and the copy it came from. Restored on any
# exit, a kill in the middle included (T10: after TaskStop matches.ts stayed
# broken). A copy also lies in the tree, so a run killed with -9, which no
# trap sees, is undone by the next one.
pending="$root/web/e2e/results/.break-pending"
broken=""
restore() {
  [ -n "$broken" ] || return 0
  cp "$pending/orig" "$broken" && rm -rf "$pending" && broken=""
}
trap 'restore; rm -rf "$logs"' EXIT
trap 'exit 130' INT; trap 'exit 143' TERM; trap 'exit 129' HUP
if [ -f "$pending/file" ]; then
  broken="$(cat "$pending/file")"
  echo "  ! прошлый прогон оборван посреди поломки: $broken восстановлен из копии" >&2
  restore
fi
failed=0; total=0; spoiled=0

for row in "${PATHS[@]}"; do
  IFS='|' read -r spec command file match instead <<<"$row"
  read -r script args <<<"$command"
  [ -n "${E2E_PATHS_ONLY:-}" ] && [ "$spec" != "$E2E_PATHS_ONLY" ] && continue
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
  bash "$here/$script" $args >"$logs/$spec.clean.log" 2>&1
  code=$?
  if [ "$code" != 0 ]; then
    failed=$((failed + 1)); spoiled=$((spoiled + 1))
    printf '  ✗ %-14s брак прогона: красный и без поломки — %s\n' "$spec" "$(grep -m1 -E 'Error:' "$logs/$spec.clean.log" | sed 's/^ *//')"
    continue
  fi
  cp "$target" "$logs/$spec.orig"
  mkdir -p "$pending"; cp "$target" "$pending/orig"; printf '%s' "$target" >"$pending/file"
  broken="$target"
  MATCH="$match" INSTEAD="$instead" python3 - "$target" <<'EOF'
import os, sys
p = sys.argv[1]
lines = open(p).read().split("\n")
lines = [os.environ["INSTEAD"] if os.environ["MATCH"] in l else l for l in lines]
open(p, "w").write("\n".join(lines))
EOF
  bash "$here/$script" $args >"$logs/$spec.log" 2>&1
  code=$?
  restore
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
[ "$spoiled" = 0 ] || echo "брак прогона: $spoiled — путь красный и без поломки, его поломка не проверена"
[ "$total" != 0 ] || { echo "ни одного пути: E2E_PATHS_ONLY=${E2E_PATHS_ONLY:-} нет в PATHS"; exit 1; }
[ "$failed" = 0 ]
