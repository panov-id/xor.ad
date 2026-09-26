#!/usr/bin/env bash
# Control break for the feed's first-tier verdict (P1, 2026-09-26): a test that
# never went red proves nothing (project rule). Two breaks, each restored by
# git afterwards, whatever happens:
#
#   1. the rules stop seeing links  → feed_verdict_rules.test.ts (unit, no
#      database) must go red on "a link or a contact is flagged";
#   2. the route stops publishing by rules (mode compared against a word that
#      is never set) → feed_verdict.test.ts must go red on "published in the
#      request … under the default mode" — run through the database script,
#      filtered to that case so the whole suite is not replayed.
#
#   scripts/break-feed-verdict.sh          # both breaks
#   scripts/break-feed-verdict.sh unit     # the unit one only (seconds)
#   scripts/break-feed-verdict.sh db       # the database one only (minutes)
#
# Exit 0 when every requested break went red and the tree is restored; 1 when a
# break stayed green (the guard is decoration) or the tree could not be restored.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
lib="relay/node/src/lib/feed_verdict.ts"
route="relay/node/src/routes/feed.ts"
which="${1:-both}"

restore() { git -C "$root" checkout -- "$lib" "$route"; }
trap restore EXIT INT TERM

# One tree, one break run: the restore is git checkout of two files, and a
# second run in the same tree would restore under the first one's feet.
if [ -n "$(git -C "$root" status --porcelain -- "$lib" "$route")" ]; then
  echo "$lib or $route is already modified in this tree — commit or stash first, the break restores with git checkout" >&2
  exit 1
fi

failed=0

if [ "$which" = both ] || [ "$which" = unit ]; then
  echo "== break 1: the rules stop seeing links"
  sed -i 's|if (LINK.test(seen)) reasons.push("link");|if (false) reasons.push("link");|' "$root/$lib"
  grep -q 'if (false) reasons.push("link")' "$root/$lib" || { echo "the break did not apply" >&2; exit 1; }
  out=$(docker run --rm -v "$root/relay/node":/node -w /node "$image" \
    deno test --allow-env --allow-read --allow-net=127.0.0.1 test/feed_verdict_rules.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
  echo "$out" | grep -E 'a link or a contact is flagged|passed \| [0-9]+ failed' | tail -2
  if echo "$out" | grep -q 'a link or a contact is flagged, whichever way it is spelled ... FAILED'; then
    echo "   red as expected"
  else
    echo "   STAYED GREEN — the guard proves nothing"; failed=1
  fi
  restore
fi

if [ "$which" = both ] || [ "$which" = db ]; then
  echo "== break 2: the route stops publishing by rules"
  sed -i 's|if (verdictMode() === "rules") {|if (verdictMode() === "never") {|' "$root/$route"
  grep -q '=== "never"' "$root/$route" || { echo "the break did not apply" >&2; exit 1; }
  out=$(bash "$root/scripts/run-relay-database-tests.sh" --filter "under the default mode" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
  echo "$out" | grep -E '^== test/feed_verdict.test.ts|under the default mode|passed \| [0-9]+ failed' | tail -4
  if echo "$out" | grep -q 'under the default mode ... FAILED'; then
    echo "   red as expected"
  else
    echo "   STAYED GREEN — the guard proves nothing"; failed=1
  fi
  restore
fi

# Restored, and provably so.
if [ -n "$(git -C "$root" status --porcelain -- "$lib" "$route")" ]; then
  echo "the tree is not restored" >&2; exit 1
fi
echo "== restored: $lib $route clean"
exit "$failed"
