#!/usr/bin/env bash
# Control break for the node's CORS lists (W1b, 2026-09-26): a test that never
# went red proves nothing. The signature's header is dropped from what a
# preflight allows — a type-valid break, one list entry — and
# test/cors_signed.test.ts must go red twice: the preflight no longer allows
# x-identity-sign, and the list no longer matches what the node reads. The
# tree is restored by git afterwards, whatever happens.
#
#   scripts/break-cors.sh
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"
lib="relay/node/src/lib/cors.ts"
restore() { git -C "$root" checkout -- "$lib"; }
trap restore EXIT INT TERM
if [ -n "$(git -C "$root" status --porcelain -- "$lib")" ]; then
  echo "$lib is already modified — commit first; the break restores with git checkout" >&2; exit 1
fi
echo "== break: x-identity-sign is no longer allowed on a preflight"
sed -i '/^  "x-identity-sign",$/d' "$root/$lib"
grep -q '"x-identity-sign"' "$root/$lib" && { echo "the break did not apply" >&2; exit 1; }
out=$(docker run --rm -v "$root/relay/node":/node -w /node "$image" \
  deno test --allow-env --allow-read --allow-write --allow-net=127.0.0.1 test/cors_signed.test.ts 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
echo "$out" | grep -E '\.\.\. (ok|FAILED)|passed \| [0-9]+ failed' | head -6
if echo "$out" | grep -q 'a preflight allows every header a signed call carries ... FAILED' &&
   echo "$out" | grep -q 'exactly what the node reads from a request, plus the panel.s ... FAILED'; then
  echo "   red as expected"; status=0
else
  echo "   STAYED GREEN — the guard proves nothing"; status=1
fi
restore
[ -z "$(git -C "$root" status --porcelain -- "$lib")" ] || { echo "the tree is not restored" >&2; exit 1; }
echo "== restored: $lib clean"
exit "$status"
