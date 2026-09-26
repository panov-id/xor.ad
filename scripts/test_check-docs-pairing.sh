#!/usr/bin/env bash
# Probes of check-docs-pairing.sh: the artel's working copies are not documents
# of the repository (B37, 2026-09-26).
#
#   scripts/test_check-docs-pairing.sh
#
# 1. A root with one pair and a .claude/worktrees copy holding a pair that
#    disagrees: the check counts one pair and stays green.
# 2. The same repository checked out at <root>/.claude/worktrees/par-x, run with
#    --root there: its own pair is still counted — the skip is relative to the
#    root, not to wherever the path happens to lie.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fail=0
pair() {  # <dir> <number in RU> <number in EN>
  mkdir -p "$1"
  printf '# Документ\n\nПредел — %s запросов.\n' "$2" > "$1/probe_RU.md"
  printf '# Document\n\nThe limit is %s requests.\n' "$3" > "$1/probe_EN.md"
}

pair "$tmp/repo/docs" 600 600
pair "$tmp/repo/.claude/worktrees/par-x/docs" 600 700
out="$(bash "$HERE/check-docs-pairing.sh" --root "$tmp/repo" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s' "$out" | grep -q 'пар проверено: 1 '; then
  echo "ok    a working copy under .claude/worktrees is not walked"
else
  echo "FAIL  a working copy under .claude/worktrees was walked (rc=$rc): $(printf '%s' "$out" | grep -E 'MISMATCH|пар проверено' | head -2 | tr '\n' ' ')"
  fail=1
fi

out="$(bash "$HERE/check-docs-pairing.sh" --root "$tmp/repo/.claude/worktrees/par-x" 2>&1)"; rc=$?
if [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'MISMATCH probe'; then
  echo "ok    a check run inside a working copy still reads its own pairs"
else
  echo "FAIL  a check run inside a working copy did not read its own pair (rc=$rc): $(printf '%s' "$out" | tail -2 | tr '\n' ' ')"
  fail=1
fi
exit $fail
