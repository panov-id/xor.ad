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
# 3. Numbers with a unit are compared whatever their size, and dates glued to a
#    URL are compared (T2, 27.09.2026). Each shape twice: the halves agree —
#    green; they disagree — red. A date inside the address is not compared.
probe() {  # <expect: green|red> <label> <line in RU> <line in EN>
  local dir="$tmp/unit-$RANDOM$RANDOM"
  mkdir -p "$dir/docs"
  printf '# Документ\n\n%s\n' "$3" > "$dir/docs/probe_RU.md"
  printf '# Document\n\n%s\n' "$4" > "$dir/docs/probe_EN.md"
  local out rc
  out="$(bash "$HERE/check-docs-pairing.sh" --root "$dir" 2>&1)"; rc=$?
  if { [ "$1" = green ] && [ "$rc" -eq 0 ]; } || { [ "$1" = red ] && [ "$rc" -ne 0 ] && printf '%s' "$out" | grep -q 'MISMATCH probe'; }; then
    echo "ok    $2"
  else
    echo "FAIL  $2 (expected $1, rc=$rc): $(printf '%s' "$out" | grep -E 'MISMATCH|RU|EN|пар проверено' | head -3 | tr '\n' ' ')"
    fail=1
  fi
}
probe green "a rate agrees: 60 в минуту / 60 per minute"   "Не больше 60 в минуту."       "At most 60 per minute."
probe red   "a rate moved in one half: 60 / 61 per minute"  "Не больше 60 в минуту."       "At most 61 per minute."
probe green "a rate as 60/min agrees with 60 a minute"      "Предел 60/мин."               "The limit is 60 a minute."
probe green "a term agrees: 30 дней / 30 days"              "Хранится 30 дней."            "Kept for 30 days."
probe red   "a term moved: 30 дней / 31 days"               "Хранится 30 дней."            "Kept for 31 days."
probe green "a short unit agrees: 5 мин / 5 min"            "Пауза 5 мин."                 "A pause of 5 min."
probe red   "a short unit moved: 5 мин / 15 min"            "Пауза 5 мин."                 "A pause of 15 min."
probe green "a share agrees: 15 % / 15%"                    "Порог 15 %."                  "The threshold is 15%."
probe red   "a share moved: 15 % / 16%"                     "Порог 15 %."                  "The threshold is 16%."
probe green "a bare small number is still style: 5 / five"  "Пять человек, то есть 5."     "Five people."
probe red   "a date after a URL and a bracket: ),27.09 / ),28.09" "См. (https://x.test/y),27.09.2026." "See (https://x.test/y),28.09.2026."
probe red   "a date after a URL and a dash: )—27.09 / )—28.09"   "См. (https://x.test/y)—27.09.2026." "See (https://x.test/y)—28.09.2026."
probe red   "a date after a URL and a pipe: |27.09 / |28.09"     "| https://x.test/y|27.09.2026 |"    "| https://x.test/y|28.09.2026 |"
probe red   "a date as a link's text: [27.09](…) / [28.09](…)"   "[27.09.2026](https://x.test/y)"     "[28.09.2026](https://x.test/y)"
probe green "a date glued to a URL agrees"                    "См. (https://x.test/y),27.09.2026." "See (https://x.test/y),27.09.2026."
probe green "a date inside the address is the address"        "См. https://x.test/?d=27.09.2026 ." "See https://x.test/?d=28.09.2026 ."
exit $fail
