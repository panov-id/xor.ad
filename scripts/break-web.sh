#!/usr/bin/env bash
# Control break for the web face's e2e (W1, 2026-09-26): a test that never
# went red proves nothing. The seal of the vault is opened with the local half
# alone — the share cut to nothing, a type-valid break: an unused parameter is
# a broken build, not a red test — so the page's own check says "failed" and
# the feed screen's data-sealed attribute is not "ok"; the e2e run must go red
# on that line, and the tree is restored by git afterwards, whatever happens.
#
#   scripts/break-web.sh      # ~2 min: the whole stand comes up once
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vault="web/src/vault.ts"
restore() { git -C "$root" checkout -- "$vault"; }
trap restore EXIT INT TERM
if [ -n "$(git -C "$root" status --porcelain -- "$vault")" ]; then
  echo "$vault is already modified — commit first; the break restores with git checkout" >&2; exit 1
fi
echo "== break: the seal is opened without the node's share"
sed -i 's|  const key = await storageKey(material.local, share, record.deviceSalt);|  const key = await storageKey(material.local, share.slice(0, 0), record.deviceSalt);|' "$root/$vault"
grep -q 'share.slice(0, 0), record.deviceSalt' "$root/$vault" || { echo "the break did not apply" >&2; exit 1; }
out=$(bash "$root/scripts/run-web-tests.sh" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
echo "$out" | grep -E 'data-sealed|✘|✓|[0-9]+ (passed|failed)' | head -6
if echo "$out" | grep -q 'toHaveAttribute' && echo "$out" | grep -qE '1 failed'; then
  echo "   red as expected"; status=0
else
  echo "   STAYED GREEN — the guard proves nothing"; status=1
fi
restore
[ -z "$(git -C "$root" status --porcelain -- "$vault")" ] || { echo "the tree is not restored" >&2; exit 1; }
echo "== restored: $vault clean"
exit "$status"
