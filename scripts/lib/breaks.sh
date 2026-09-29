# The --breaks gates of run-e2e-paths.sh, run-depth-tests.sh and
# run-depth-live-ui.sh share two steps (W10-G1): undoing a break a kill -9
# left behind, and telling a caught break from a run that never got to its
# tests. Sourced, not run.

# breaks_undo_left <pending dir>: the copy of a file a killed run left broken
# is put back, on every start, --breaks or not.
breaks_undo_left() {
  [ -f "$1/file" ] || return 0
  local left
  left="$(cat "$1/file")"
  cp "$1/orig" "$left" && rm -rf "$1"
  echo "  ! прошлый прогон оборван посреди поломки: $left восстановлен из копии" >&2
}

# breaks_judge <name> <exit code> <log> <regex of a failed test>: a break is
# caught only when the run failed AND a test says it failed. Any other non-zero
# code (the stand did not come up, the build broke, the break is not valid
# code) is BREAK BROKEN: it proves nothing about the guard. Prints the verdict
# and the lines of the failure, since the log is gone after the run.
# Returns 0 caught, 1 green under the break, 2 broken.
breaks_judge() {
  local name="$1" code="$2" log="$3" failed_re="$4" plain
  plain="$(sed 's/\x1b\[[0-9;]*m//g' "$log")"
  if [ "$code" = 0 ]; then
    printf '  ✗ %-22s остался зелёным с поломкой\n' "$name"
    return 1
  fi
  if ! grep -qE -- "$failed_re" <<<"$plain"; then
    printf '  ✗ %-22s BREAK BROKEN: код %s, но ни один тест не упал — стенд, сборка или сама поломка\n' "$name" "$code"
    tail -5 <<<"$plain" | sed 's/^/      | /'
    return 2
  fi
  printf '  ✓ %-22s красный\n' "$name"
  grep -E -m5 -- 'Error|✘|FAIL|[0-9]+ failed|=> |expected' <<<"$plain" | sed 's/^ */      | /'
  return 0
}
