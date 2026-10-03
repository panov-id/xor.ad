#!/usr/bin/env bash
# Probe of scripts/check-disk.sh: red and named on a disk at the limit, green
# under it. df is a fake printing the given percentage.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cat > "$work/df" <<'SH'
#!/usr/bin/env bash
echo "Filesystem 1024-blocks Used Available Capacity Mounted on"
echo "/dev/fake 1000000 ${FAKE_PCT}0000 204800 ${FAKE_PCT}% /fake"
SH
chmod +x "$work/df"
failures=0
expect() {  # expect <pct> <code> <text> <what>
  local output; output=$(FAKE_PCT="$1" DF="$work/df" bash "$here/check-disk.sh" 2>&1); local code=$?
  if [ "$code" = "$2" ] && grep -qF -- "$3" <<< "$output"; then printf '  ✓ %s\n' "$4"
  else printf '  ✗ %s — expected code %s and "%s", got %s: %s\n' "$4" "$2" "$3" "$code" "$output"; failures=$((failures + 1)); fi
}
expect 96 1 "диск /fake занят на 96%" "96%: red, the mount named"
expect 95 1 "диск /fake занят на 95%" "95%, the limit itself: red"
expect 80 0 "ниже 95%" "80%: green"
[ "$failures" = 0 ] || { echo "провалено: $failures" >&2; exit 1; }
echo "пробы check-disk: 3 из 3"
