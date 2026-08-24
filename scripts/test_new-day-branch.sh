#!/usr/bin/env bash
# What new-day-branch.sh promises, checked against three throwaway repositories.
#
#   scripts/test_new-day-branch.sh
#   SUT=/path/to/other-copy.sh scripts/test_new-day-branch.sh   # check a variant
#
# The script under test moves branches in three checkouts at once, so it cannot
# be tried out on the real ones: a wrong number there is a day nobody can merge
# by name. Everything here happens in a temporary directory that is three git
# repositories deep and is removed on the way out, including on failure.
#
# Dates are the substance of two of these cases — a branch made yesterday must
# yield a new day, one made today must not — and git writes the reflog entry
# with GIT_COMMITTER_DATE, so yesterday can be staged rather than waited for.
#
# The cases are named for what breaks if they stop holding: T2 guards against a
# second run inventing a day, T4 against a number already taken on the remote
# being handed out twice, T6 against a day branch quietly tracking dev.
#
# Exit 0 every case held · 1 at least one did not.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="${SUT:-$SCRIPT_DIR/new-day-branch.sh}"

[ -x "$SUT" ] || { echo "нет исполняемого скрипта $SUT" >&2; exit 1; }

SANDBOX="$(mktemp -d)"
trap 'rm -rf "$SANDBOX"' EXIT

YESTERDAY="$(date -d yesterday +%FT10:00:00)"
TODAY="$(date +%F)"

passed=0; failed=0
check() { # check <название> <ожидание> <факт>
  if [ "$2" = "$3" ]; then
    printf 'OK   %-44s %s\n' "$1" "$3"; passed=$((passed+1))
  else
    printf 'FAIL %-44s ждали «%s», получили «%s»\n' "$1" "$2" "$3"; failed=$((failed+1))
  fi
}

reset_sandbox() { # reset_sandbox <день> — три репозитория с локальной dayN, созданной вчера
  rm -rf "${SANDBOX:?}/group" "$SANDBOX/origin.git"; mkdir -p "$SANDBOX/group"
  for repo in xor.ad sosed.place neighbro.place; do
    d="$SANDBOX/group/$repo"; mkdir -p "$d/scripts"
    git -C "$d" init -q .
    git -C "$d" config user.email test@example.invalid
    git -C "$d" config user.name test
    echo seed > "$d/seed.txt"; git -C "$d" add seed.txt
    GIT_COMMITTER_DATE="$YESTERDAY" GIT_AUTHOR_DATE="$YESTERDAY" git -C "$d" commit -qm seed
    GIT_COMMITTER_DATE="$YESTERDAY" git -C "$d" checkout -q -b "day$1"
  done
  # The copy sits where the real one sits: the script finds its siblings through
  # its own location, and a test running it from elsewhere would prove nothing.
  cp "$SUT" "$SANDBOX/group/xor.ad/scripts/new-day-branch.sh"
  chmod +x "$SANDBOX/group/xor.ad/scripts/new-day-branch.sh"
}
run() { "$SANDBOX/group/xor.ad/scripts/new-day-branch.sh" "$@" 2>&1; }
branches() {
  for r in xor.ad sosed.place neighbro.place; do
    git -C "$SANDBOX/group/$r" rev-parse --abbrev-ref HEAD
  done | sort -u | tr '\n' ' '
}
count_day_branches() {
  git -C "$SANDBOX/group/xor.ad" for-each-ref --format='%(refname:short)' refs/heads | grep -c '^day'
}

echo "=== T1 новый день: вчерашняя day7 в трёх репозиториях → day8 везде"
reset_sandbox 7
out="$(run)"; code=$?
check "T1 код возврата" "0" "$code"
check "T1 ветка во всех трёх" "day8 " "$(branches)"
check "T1 upstream не выставлен" "3" "$(grep -c 'upstream —' <<<"$out")"

echo "=== T2 повторный запуск в тот же день: новой ветки быть не должно"
before="$(count_day_branches)"
out="$(run)"; code=$?
check "T2 код возврата" "0" "$code"
check "T2 число dayN-веток не выросло" "$before" "$(count_day_branches)"
check "T2 всё ещё day8" "day8 " "$(branches)"
check "T2 сказано, что заведена сегодня" "1" "$(grep -c "заведена сегодня ($TODAY)" <<<"$out")"

echo "=== T3 --again: вторая ветка той же датой"
out="$(run --again)"; code=$?
check "T3 код возврата" "0" "$code"
check "T3 ветка" "day9 " "$(branches)"
check "T3 предупреждение про --again" "1" "$(grep -c -- '--again:' <<<"$out")"

echo "=== T4 максимум берётся и из origin/*: origin/day12 в одном репозитории"
reset_sandbox 7
d="$SANDBOX/group/neighbro.place"
git -C "$d" update-ref refs/remotes/origin/day12 "$(git -C "$d" rev-parse HEAD)"
out="$(run)"
check "T4 ветка после origin/day12" "day13 " "$(branches)"

echo "=== T5 detached HEAD → отказ"
reset_sandbox 7
git -C "$SANDBOX/group/sosed.place" checkout -q --detach HEAD
out="$(run)"; code=$?
check "T5 код возврата" "1" "$code"
check "T5 назван репозиторий" "1" "$(grep -c 'sosed.place: HEAD отделён' <<<"$out")"

echo "=== T6 upstream на общую ветку → красный, а не тишина"
reset_sandbox 7
d="$SANDBOX/group/xor.ad"
git init -q --bare "$SANDBOX/origin.git"
git -C "$d" remote add origin "$SANDBOX/origin.git"
git -C "$d" push -q origin day7:refs/heads/dev
git -C "$d" fetch -q origin
out="$(run)"
git -C "$d" branch --set-upstream-to=origin/dev day8 >/dev/null 2>&1
check "T6 upstream действительно выставлен" "origin/dev" \
  "$(git -C "$d" rev-parse --abbrev-ref 'day8@{upstream}' 2>&1)"
out="$(run)"; code=$?
check "T6 код возврата" "1" "$code"
check "T6 назван вредный upstream" "1" "$(grep -c 'upstream ведёт на origin/dev' <<<"$out")"

echo "=== T7 --dry-run ничего не меняет"
reset_sandbox 7
before="$(count_day_branches)$(branches)"
out="$(run --dry-run)"
check "T7 состояние не изменилось" "$before" "$(count_day_branches)$(branches)"
check "T7 сказано, что создал бы" "3" "$(grep -c 'создал бы day8' <<<"$out")"

echo "=== T8 незакоммиченная работа переезжает на новую ветку"
reset_sandbox 7
echo "work in progress" > "$SANDBOX/group/sosed.place/wip.txt"
echo "changed" >> "$SANDBOX/group/sosed.place/seed.txt"
out="$(run)"
check "T8 ветка" "day8 " "$(branches)"
check "T8 файл на месте" "work in progress" "$(cat "$SANDBOX/group/sosed.place/wip.txt")"
check "T8 правка на месте" "1" \
  "$(git -C "$SANDBOX/group/sosed.place" status --porcelain | grep -c 'M seed.txt')"

echo "=== T9 неизвестный аргумент → отказ, а не молчаливый прогон"
reset_sandbox 7
out="$(run --tomorrow)"; code=$?
check "T9 код возврата" "1" "$code"
check "T9 ветка не создана" "day7 " "$(branches)"

echo
echo "прошло $passed, упало $failed"
exit $((failed > 0))
