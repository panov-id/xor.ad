# The --breaks gates of run-e2e-paths.sh, run-depth-tests.sh and
# run-depth-live-ui.sh share two steps (W10-G1): undoing a break a kill -9
# left behind, and telling a caught break from a run that never got to its
# tests. Sourced, not run.

# breaks_undo_left <pending dir>: the copy of a file a killed run left broken
# is put back, on every start, --breaks or not.
# The copy is put back only while the file still carries the break's marker
# ("BROKEN by"): a copy left behind by a run killed under an older tree would
# otherwise overwrite code merged since (01.10.2026: a copy of matches.ts from
# before wave 10 undid its starters ordering on the next start; e2e 15 of 17).
breaks_undo_left() {
  [ -f "$1/file" ] || return 0
  local left
  left="$(cat "$1/file")"
  if [ -f "$left" ] && grep -q 'BROKEN by' "$left"; then
    cp "$1/orig" "$left" && rm -rf "$1"
    echo "  ! прошлый прогон оборван посреди поломки: $left восстановлен из копии" >&2
  else
    rm -rf "$1"
    echo "  ! копия поломки от прошлого прогона устарела ($left без маркера) — выброшена, файл не тронут" >&2
  fi
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

# breaks_workdir <root> <name>: a folder for a --breaks run's logs and copies,
# on disk under the repository (testing/results, ignored by git), not in /tmp:
# /tmp is a tmpfs shared by the whole machine and filled up three times
# (26.09, 27.09, 04.10.2026 — "cp: No space left on device" in the middle of a
# table-game break). BREAKS_WORK_ROOT points it elsewhere (the probe). Prints
# the path; returns 1 when the folder cannot be made.
breaks_workdir() {
  local dir="${BREAKS_WORK_ROOT:-$1/testing/results}/$2-$$"
  if mkdir -p "$dir" 2>/dev/null && [ -w "$dir" ]; then printf '%s' "$dir"; return 0; fi
  echo "  ✗ каталог для копий поломок не создан: $dir — ни одна поломка не ставится" >&2
  return 1
}

# breaks_save <target> <pending dir> [extra copy]: the copies a break is undone
# from, written and read back BEFORE the break is put in. Any failed write (a
# full disk, a folder that cannot be made) removes what was half-written and
# returns 1: the caller must not break the file then — a break with no whole
# copy behind it is a broken tree.
breaks_save() {
  local target="$1" pending="$2" extra="${3:-}"
  if mkdir -p "$pending" 2>/dev/null && cp "$target" "$pending/orig" 2>/dev/null &&
     cmp -s "$target" "$pending/orig" && printf '%s' "$target" >"$pending/file" 2>/dev/null &&
     { [ -z "$extra" ] || { cp "$target" "$extra" 2>/dev/null && cmp -s "$target" "$extra"; }; }; then
    return 0
  fi
  rm -rf "$pending" 2>/dev/null
  [ -z "$extra" ] || rm -f "$extra" 2>/dev/null
  echo "  ✗ копия ${target##*/} не сохранена (${pending}${extra:+, $extra}) — поломка не ставится, файл не тронут" >&2
  return 1
}
