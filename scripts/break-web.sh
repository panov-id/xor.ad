#!/usr/bin/env bash
# Control break for the web face's e2e (W1, 2026-09-26): a test that never
# went red proves nothing. Three breaks, each turns the whole e2e run red on
# one legible line, and the tree is put back from copies taken before the
# first sed — never by git: the tree may hold uncommitted work, and
# git checkout would destroy it.
#
# Since 17.10.2026 the vault's code is split: the registration and its check
# are the core's (depth/core/enroll.ts), the cold open is the core's
# (depth/core/unlock.ts openWith), the PIN's re-seal stays in web/src/vault.ts.
# So each break names the file the web actually runs the path through.
#
#   scripts/break-web.sh      # ~15 min a break: the whole e2e runs three times
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
vault="web/src/vault.ts"
enroll="depth/core/enroll.ts"
unlock="depth/core/unlock.ts"
files=("$vault" "$enroll" "$unlock")
copies="$(mktemp -d)"
restore() {
  local f
  for f in "${files[@]}"; do
    [ -f "$copies/$f" ] && cp -p "$copies/$f" "$root/$f"
  done
}
cleanup() { restore; rm -rf "$copies"; }
# A signal ends the script too (a trap that only cleans up would let it go on).
trap cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM
for f in "${files[@]}"; do
  mkdir -p "$copies/$(dirname "$f")"
  cp -p "$root/$f" "$copies/$f" || { echo "cannot copy $f" >&2; exit 1; }
  [ -f "$root/$f" ] || { echo "$f is missing" >&2; exit 1; }
done

# sed on one file, and the hits counted: the break must land exactly where it
# is meant to, else the run proves nothing (a moved line is a silent green).
#   cut <file> <sed script> <fixed text left by the break> <hits expected>
cut() {
  local file="$1" script="$2" marker="$3" want="$4" got
  sed -i "$script" "$root/$file"
  got=$(grep -cF -- "$marker" "$root/$file")
  [ "$got" = "$want" ] || { echo "the break did not apply to $file: $got hits, $want expected" >&2; exit 1; }
}
# One e2e run, colours off; prints the lines that matter. The whole text is
# kept in web/e2e/results/ (not committed), to read the failures after the run.
run() {
  mkdir -p "$root/web/e2e/results"
  out=$(bash "$root/scripts/run-web-tests.sh" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
  echo "$out" > "$root/web/e2e/results/break-web-$$-$((++runs)).log"
  echo "   full text: web/e2e/results/break-web-$$-$runs.log"
  echo "$out" | grep -E "$1|✘" | head -6
  echo "$out" | grep -E '[0-9]+ (passed|failed|flaky|skipped) \(' | tail -3
}
# Here-strings, not pipes: grep -q quits at the first hit and, under pipefail, echo's SIGPIPE would turn a hit into a miss.
has() { grep -qE -- "$1" <<<"$out"; }
failed() { has '[1-9][0-9]* failed'; }

status=0
runs=0

echo "== break: the seal is opened without the node's share"
# Both readings of the vault key the web runs after registration and after a
# reload: the check right after registration (enroll.ts openSealed, which
# Register.tsx calls) and the cold path (unlock.ts openWith, which both the PIN
# and the grace go through). The share is cut to one byte (the core refuses an
# empty half outright), a type-valid break: an unused parameter is a broken
# build, not a red test. The sealing at registration (enroll.ts, pin.local) is
# left alone, so the page's own check says "failed" and the feed screen's
# data-sealed attribute is not "ok".
cut "$enroll" 's|vaultKey(material.local, share)|vaultKey(material.local, share.slice(0, 1))|g' 'vaultKey(material.local, share.slice(0, 1))' 1
cut "$unlock" 's|vaultKey(local, share)|vaultKey(local, share.slice(0, 1))|g' 'vaultKey(local, share.slice(0, 1))' 1
run 'data-sealed'
if has 'toHaveAttribute' && failed; then
  echo "   red as expected"
else
  echo "   STAYED GREEN — the guard proves nothing"; status=1
fi
restore
cmp -s "$copies/$enroll" "$root/$enroll" && cmp -s "$copies/$unlock" "$root/$unlock" || { echo "the tree is not restored" >&2; exit 1; }

# Break 2 (W1d): the wrapping pair raised after a reload is a fresh one, not
# the one out of the seal — the page's check says so (data-sealed becomes
# "unlocked-new-wrap") and the e2e must go red on the reload's line.
echo "== break 2: the wrapping pair after a reload is a fresh one"
# No import is touched: the constants are already imported in unlock.ts, and an
# import line that moved would turn this into a broken build, not a red test.
cut "$unlock" 's|^  const same = equal(await checkOf(wrapPrivate), record.wrapCheck);|  wrapPrivate = (await crypto.subtle.generateKey(WRAP_ALGORITHM, false, WRAP_USAGES) as CryptoKeyPair).privateKey;\n&|' 'wrapPrivate = (await crypto.subtle.generateKey(WRAP_ALGORITHM, false, WRAP_USAGES) as CryptoKeyPair).privateKey;' 1
run 'unlocked-new-wrap'
if has 'data-sealed="unlocked-new-wrap"' && failed; then
  echo "   red as expected"
else
  echo "   STAYED GREEN — the guard proves nothing"; status=1
fi
restore
cmp -s "$copies/$unlock" "$root/$unlock" || { echo "the tree is not restored" >&2; exit 1; }

# Break 3 (W4): the PIN changes but the vault is not re-sealed — the record
# on the disk is not written. The next reload cannot open with the new PIN,
# and me.spec.ts must go red where it expects the feed after the unlock.
echo "== break 3: the PIN changes, the vault is not re-sealed"
cut "$vault" 's|^    await putRecord(resealed);|    void resealed;|' '    void resealed;' 1
run 'me.spec'
if has '✘ +[0-9]+ .*me.spec.ts' && failed; then
  echo "   red as expected"
else
  echo "   STAYED GREEN — the guard proves nothing"; status=1
fi
restore
for f in "${files[@]}"; do
  cmp -s "$copies/$f" "$root/$f" || { echo "the tree is not restored: $f" >&2; exit 1; }
done
echo "== restored: ${files[*]} equal to the copies"
exit "$status"
