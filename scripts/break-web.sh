#!/usr/bin/env bash
# Control break for the web face's e2e (W1, 2026-09-26): a test that never
# went red proves nothing. The seal of the vault is opened with the local half
# alone — the share cut to one byte (the core refuses an empty half outright), a type-valid break: an unused parameter is
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
sed -i 's|  return await unsealLong(record, material.local, share);|  return await unsealLong(record, material.local, share.slice(0, 1));|' "$root/$vault"
grep -q 'material.local, share.slice(0, 1))' "$root/$vault" || { echo "the break did not apply" >&2; exit 1; }
out=$(bash "$root/scripts/run-web-tests.sh" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
echo "$out" | grep -E 'data-sealed|✘|✓|[0-9]+ (passed|failed)' | head -6
if echo "$out" | grep -q 'toHaveAttribute' && echo "$out" | grep -qE '1 failed'; then
  echo "   red as expected"; status=0
else
  echo "   STAYED GREEN — the guard proves nothing"; status=1
fi
restore

# Break 2 (W1d): the wrapping pair raised after a reload is a fresh one, not
# the one out of the seal — the page's check says so (data-sealed becomes
# "unlocked-new-wrap") and the e2e must go red on the reload's line.
echo "== break 2: the wrapping pair after a reload is a fresh one"
# No import is touched: the constants are already imported, and an import
# line that moved would turn this into a broken build, not a red test.
sed -i 's|  const same = equal(await checkOf(wrapPrivate), record.wrapCheck);|  wrapPrivate = (await crypto.subtle.generateKey(WRAP_ALGORITHM, false, WRAP_USAGES) as CryptoKeyPair).privateKey;\n  const same = equal(await checkOf(wrapPrivate), record.wrapCheck);|' "$root/$vault"
grep -q 'wrapPrivate = (await crypto.subtle.generateKey(WRAP_ALGORITHM, false, WRAP_USAGES) as CryptoKeyPair).privateKey;' "$root/$vault" || { echo "the break did not apply" >&2; exit 1; }
out=$(bash "$root/scripts/run-web-tests.sh" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
echo "$out" | grep -E 'unlocked-new-wrap|✘|✓|[0-9]+ (passed|failed)' | head -6
if echo "$out" | grep -q 'data-sealed="unlocked-new-wrap"' && echo "$out" | grep -qE '1 failed'; then
  echo "   red as expected"
else
  echo "   STAYED GREEN — the guard proves nothing"; status=1
fi
restore
[ -z "$(git -C "$root" status --porcelain -- "$vault")" ] || { echo "the tree is not restored" >&2; exit 1; }
echo "== restored: $vault clean"
exit "$status"
