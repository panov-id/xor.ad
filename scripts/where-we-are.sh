#!/usr/bin/env bash
# Where we are, in one screen and without agents or stands: git, board, owner
# questions, migrations, last check-all results. Reads only local files and refs.
#
#   scripts/where-we-are.sh
set -uo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
board="${BOARD_DIR:-$root/../.parallel/xor.ad}"
cd "$root"

echo "== git"
roadmap_date=$(sed -n '1s/.*на \([0-9.]*\).*/\1/p' docs/roadmap_RU.md)
since=$(echo "$roadmap_date" | awk -F. '{print $3"-"$2"-"$1}')
printf '  %s @ %s · незакоммичено %s\n' "$(git branch --show-current)" "$(git rev-parse --short HEAD)" \
  "$(git status --porcelain | wc -l)"
printf '  коммитов после среза roadmap (%s): %s\n' "$roadmap_date" "$(git log --oneline --since="$since" | wc -l)"
for r in "$root" "$root/../sosed.place" "$root/../neighbro.place"; do
  [ -d "$r/.git" ] || continue
  printf '  %-15s впереди origin/dev на %s (ref локальный, без fetch)\n' "$(basename "$r")" \
    "$(git -C "$r" rev-list --count origin/dev..HEAD 2>/dev/null || echo '?')"
done

echo "== миграции"
printf '  файлов %s, последняя %s\n' "$(ls relay/node/db/*.sql | wc -l)" "$(basename "$(ls relay/node/db/*.sql | tail -1)")"

if [ -f "$board/tasks.tsv" ]; then
  echo "== доска"
  awk -F'\t' 'NR>1{c[$2]++} END{for(k in c) printf "  %s %s\n", k, c[k]}' "$board/tasks.tsv" | sort
  echo "  висят (claimed/stopped/verified):"
  awk -F'\t' 'NR>1 && $2~/^(claimed|stopped|verified)$/ && $1~/^W1[5-9]/{printf "    %-8s %-9s %s\n", $1, $2, substr($8,1,70)}' \
    "$board/tasks.tsv"
fi

if [ -f "$board/owner.md" ]; then
  echo "== владельцу"
  printf '  строк %s, из них «РЕШЕНО» %s; последние без решения:\n' \
    "$(grep -c '^- ' "$board/owner.md")" "$(grep -c 'РЕШЕНО' "$board/owner.md")"
  grep '^- ' "$board/owner.md" | grep -v 'РЕШЕНО' | tail -3 | python3 -c 'import sys; [print("    "+l.rstrip()[:110]) for l in sys.stdin]'
fi

echo "== check-all (последние 5)"
j="$board/log/check-all.tsv"
if [ -s "$j" ]; then
  tail -5 "$j" | awk -F'\t' '{printf "  %s %s %-6s пройдено %s провалено %s пропущено %s\n",$1,$2,$3,$4,$5,$6}'
else
  echo "  журнала нет: прогонов после 07.10.2026 не было"
fi
