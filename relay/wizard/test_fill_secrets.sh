#!/usr/bin/env bash
# fill-secrets.sh: fills empty and missing keys, keeps set ones, prints no value, never fills PREVIOUS.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd); t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
printf 'SESSION_SECRET_DEV=keep-me\nVAULT_SHARE_KEY_DEV=\nVAULT_SHARE_KEY_PREVIOUS_DEV=\n' > "$t/s.env"
out=$("$here/fill-secrets.sh" "$t/s.env" dev)
fail=0
grep -qx 'SESSION_SECRET_DEV=keep-me' "$t/s.env" || { echo "FAIL a set key was changed"; fail=1; }
v=$(grep '^VAULT_SHARE_KEY_DEV=' "$t/s.env" | cut -d= -f2-)
[ "$(printf '%s' "$v" | base64 -d | wc -c)" = 32 ] || { echo "FAIL the vault key is not 32 random bytes"; fail=1; }
grep -qx 'VAULT_SHARE_KEY_PREVIOUS_DEV=' "$t/s.env" || { echo "FAIL PREVIOUS was filled"; fail=1; }
case "$out" in *"$v"*) echo "FAIL a value was printed"; fail=1;; esac
[ "$out" = "filled: VAULT_SHARE_KEY_DEV" ] || { echo "FAIL output: $out"; fail=1; }
"$here/fill-secrets.sh" "$t/s.env" dev >/dev/null
[ "$(grep '^VAULT_SHARE_KEY_DEV=' "$t/s.env" | cut -d= -f2-)" = "$v" ] || { echo "FAIL a second run changed the key"; fail=1; }
[ "$(stat -c %a "$t/s.env")" = 600 ] || { echo "FAIL the file is not 600"; fail=1; }
[ $fail = 0 ] && echo "OK fill-secrets 6 of 6"; exit $fail
