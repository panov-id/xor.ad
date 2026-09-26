#!/usr/bin/env bash
# Control break for the unlock key (W1c, 2026-09-26): a test that never went
# red proves nothing. Two breaks in lib/identity_guard.ts, each type-valid,
# each restored by git afterwards, whatever happens:
#
#   1. the guard accepts the unlock key on every route (the option is no
#      longer consulted) → test/unlock_key.test.ts must go red on "the unlock
#      key signs nothing else" — the security property of db/063;
#   2. the guard never falls back to the unlock key (the column is ignored)
#      → the same suite must go red on "signs POST /vault/share".
#
# Each break runs the database script filtered to this suite (~2 min each).
#
#   scripts/break-unlock-key.sh          # both
#   scripts/break-unlock-key.sh 1|2      # one of them
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lib="relay/node/src/lib/identity_guard.ts"
which="${1:-both}"
restore() { git -C "$root" checkout -- "$lib"; }
trap restore EXIT INT TERM
if [ -n "$(git -C "$root" status --porcelain -- "$lib")" ]; then
  echo "$lib is already modified — commit first; the break restores with git checkout" >&2; exit 1
fi
failed=0
run_suite() { bash "$root/scripts/run-relay-database-tests.sh" --filter "unlock key" 2>&1 | sed 's/\x1b\[[0-9;]*m//g'; }

if [ "$which" = both ] || [ "$which" = 1 ]; then
  echo "== break 1: the unlock key is accepted on every route"
  sed -i 's/    if (!options.allowUnlockKey || !row.unlock_public_key) return unauthorized();/    if (!row.unlock_public_key) return unauthorized();/' "$root/$lib"
  grep -q '    if (!row.unlock_public_key) return unauthorized();' "$root/$lib" || { echo "the break did not apply" >&2; exit 1; }
  out=$(run_suite)
  echo "$out" | grep -E 'signs nothing else|passed \| [0-9]+ failed' | tail -3
  if echo "$out" | grep -q 'the unlock key signs nothing else: the feed answers 401 as to a stranger ... FAILED'; then
    echo "   red as expected"
  else
    echo "   STAYED GREEN — the guard proves nothing"; failed=1
  fi
  restore
fi

if [ "$which" = both ] || [ "$which" = 2 ]; then
  echo "== break 2: the guard never falls back to the unlock key"
  sed -i 's/    if (!options.allowUnlockKey || !row.unlock_public_key) return unauthorized();/    if (!options.allowUnlockKey || !row.unlock_public_key || row.unlock_public_key.length >= 0) return unauthorized();/' "$root/$lib"
  grep -q 'row.unlock_public_key.length >= 0' "$root/$lib" || { echo "the break did not apply" >&2; exit 1; }
  out=$(run_suite)
  echo "$out" | grep -E 'signs POST /vault/share|passed \| [0-9]+ failed' | tail -3
  if echo "$out" | grep -q 'the unlock key signs POST /vault/share and gets the share ... FAILED'; then
    echo "   red as expected"
  else
    echo "   STAYED GREEN — the guard proves nothing"; failed=1
  fi
  restore
fi

[ -z "$(git -C "$root" status --porcelain -- "$lib")" ] || { echo "the tree is not restored" >&2; exit 1; }
echo "== restored: $lib clean"
exit "$failed"
