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
  "rekey|run-web-two-people.sh rekey|relay/node/src/routes/chats.ts|SET key_epoch = \$3, ephemeral_public_key = \$4, ephemeral_signature = \$5|          SET key_epoch = key_epoch + 0 * \$3::int, ephemeral_public_key = \$4, ephemeral_signature = \$5 -- BROKEN by run-e2e-paths: the reissue keeps the epoch"
  "reissue|run-web-two-people.sh reissue|relay/node/src/routes/identity.ts|UPDATE identities SET recovery_auth_hash = \$2, recovery_wrapped_key = \$3 WHERE id = \$1|      \`UPDATE identities SET recovery_auth_hash = coalesce(recovery_auth_hash, \$2), recovery_wrapped_key = \$3 WHERE id = \$1\`, // BROKEN by run-e2e-paths: the old code stays alive"
  "table|run-web-two-people.sh table|relay/node/src/routes/tables.ts|\`UPDATE table_games SET state = \$2::text::jsonb, seq = seq + 1, last_move_hash = \$3, turn_due = \$4,|      \`UPDATE table_games SET state = CASE WHEN \$2::text IS NULL THEN state ELSE state END, seq = seq + 1, last_move_hash = \$3, turn_due = \$4, -- BROKEN by run-e2e-paths: the move is not written"
  "table-game|run-web-two-people.sh table|relay/node/src/routes/tables.ts|if (!again) s.turn = (turn + 1) % s.order.length;|    // BROKEN by run-e2e-paths: the turn never passes to the other seat"
  "chat-game|run-web-two-people.sh chat-game|relay/node/src/routes/chat_games.ts|if (s.turn === null || s.order[s.turn] !== seat) return refuse(\"not_your_turn\", \"not your turn\", 409);|    if (s.turn === null || s.order[s.turn] !== seat || seat === 2) return refuse(\"not_your_turn\", \"not your turn\", 409); // BROKEN by run-e2e-paths: the judge drops the second side's move"
  "lists|run-web-two-people.sh lists|relay/node/src/routes/hidden.ts|route(\"DELETE\", \"/hidden/:id\", (c) => unhide(c.req, c.params.id));|// BROKEN by run-e2e-paths: a hidden phrase never comes back"
  "consent-wait|run-web-two-people.sh consent-wait|relay/node/src/routes/inbox.ts|(mine.accepted_at IS NOT NULL) AS consented,|            false AS consented, -- BROKEN by run-e2e-paths: after a reload the inbox forgets my consent"
  "register-feed|run-web-two-people.sh register-feed|relay/node/src/lib/pin_attempts.ts|if (!sameHash(presented, row.auth_hash)) {|  if (false) { // BROKEN by run-e2e-paths: any PIN opens the vault"
  "restore|run-web-two-people.sh restore|relay/node/src/routes/identity.ts|await freezeSession(run, session.id, \"transfer\", freezes);|      // BROKEN by run-e2e-paths: the raise leaves the lost device live"
  "restore-pin|run-web-two-people.sh restore-pin|relay/node/src/routes/identity.ts|SET auth_hash = \$2, share_enc = \$3,|          SET share_enc = \$3, -- BROKEN by run-e2e-paths: the PIN change keeps the old PIN"
  "transfer|run-web-two-people.sh transfer|relay/node/src/routes/transfer.ts|[sessionId, invite.identity, body.sign_pub as string, body.wrap_pub as string, unlockPub as string | null, label],|      [sessionId, invite.identity, body.sign_pub as string, body.wrap_pub as string, null, label], // BROKEN by run-e2e-paths: the arriving session gets no unlock key"
  "unlock-chat|run-web-two-people.sh unlock-chat|relay/node/src/routes/chats.ts|await storeWrap(run, chatId, caller.sessionId, epoch, bytes);|    // BROKEN by run-e2e-paths: the node keeps no wrap of the keys"
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
. "$here/lib/breaks.sh"
breaks_undo_left "$pending"
failed=0; total=0; spoiled=0; unproven=0

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
  # Caught only on a Playwright test that failed (W10-G1): a node that did not
  # start under a break is red too, and proves nothing.
  breaks_judge "$spec" "$code" "$logs/$spec.log" '[0-9]+ failed'
  case $? in 0) ;; 2) failed=$((failed + 1)); unproven=$((unproven + 1)) ;; *) failed=$((failed + 1)) ;; esac
done

rm -rf "$logs"
label=$([ "$mode" = "--breaks" ] && echo "поломок поймано" || echo "путей зелёных")
echo "$label $((total - failed)) из $total"
[ "$spoiled" = 0 ] || echo "брак прогона: $spoiled — путь красный и без поломки, его поломка не проверена"
[ "$unproven" = 0 ] || echo "BREAK BROKEN: $unproven — красный не от теста, поломка не проверена"
[ "$total" != 0 ] || { echo "ни одного пути: E2E_PATHS_ONLY=${E2E_PATHS_ONLY:-} нет в PATHS"; exit 1; }
[ "$failed" = 0 ]
