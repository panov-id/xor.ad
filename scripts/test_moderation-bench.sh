#!/usr/bin/env bash
# Probe of scripts/run-moderation-bench.sh (O6, panel 03.10.2026): `run` that
# raised the guard stops it on the way out, also when the pipeline fails; a
# guard already up is left alone. Docker is a fake that logs its calls.
#
#   scripts/test_moderation-bench.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
cat > "$work/docker" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$FAKE_LOG"
case "$*" in
  *" ps -q guard") [ -n "${FAKE_UP:-}" ] && echo abc123 ;;
  *" run --rm bench "*) exit "${FAKE_RUN_CODE:-0}" ;;
esac
exit 0
SH
chmod +x "$work/docker"
failures=0

case_() {  # case_ <what> <expect stop: yes|no> <env...>
  local what="$1" want="$2"; shift 2
  : > "$work/log"
  env FAKE_LOG="$work/log" DOCKER="$work/docker" "$@" bash "$here/run-moderation-bench.sh" run >/dev/null 2>&1
  local got=no; grep -q ' stop guard$' "$work/log" && got=yes
  if [ "$got" = "$want" ]; then printf '  ✓ %s\n' "$what"
  else printf '  ✗ %s — guard stopped: expected %s, got %s; calls:\n%s\n' "$what" "$want" "$got" "$(sed 's/^/      /' "$work/log")"; failures=$((failures + 1)); fi
}

case_ "run that raised the guard stops it" yes
case_ "a failed pipeline still stops the guard it raised" yes FAKE_RUN_CODE=1
case_ "a guard already up is left running" no FAKE_UP=1

[ "$failures" = 0 ] || { echo "провалено: $failures" >&2; exit 1; }
echo "пробы run-moderation-bench: 3 из 3"
