#!/usr/bin/env bash
# The day's branch, with the same name in all three repositories.
#
#   scripts/new-day-branch.sh                 # today's branch everywhere
#   scripts/new-day-branch.sh --dry-run       # say what it would do, change nothing
#   scripts/new-day-branch.sh --again         # a second branch on the same date
#   REPOS="xor.ad sosed.place" scripts/new-day-branch.sh
#
# A day is one branch across three checkouts, and its number is the only thing
# holding them together. Done by hand it is three checkouts and a number typed
# three times: skip a day in one repository and the same day's work sits on
# day34 here and day35 there, so "merge the day" stops naming one thing.
#
# The number is therefore not per repository. It is the highest dayN seen in any
# of them — local branches and origin's alike — plus one, so a day nobody
# branched in one checkout cannot pull the names apart, and a number already
# taken on the remote is not handed out a second time.
#
# Running it twice in one day must not invent a day. The latest dayN carries the
# date it was created in its reflog; if that date is today, the day is already
# open and the three checkouts are merely put back on it. --again overrides
# that, for the rare second branch on one date, and says so in the output.
#
# The branch starts from whatever each repository has checked out, and the
# uncommitted work in the tree comes along untouched — that is the point: the
# day continues, it does not restart. Nothing is committed and nothing is
# pushed; the branch gets no upstream, because a day branch tracking dev turns
# a later push into a push to the shared branch. The upstream of every branch
# is checked at the end rather than assumed.
#
# Exit 0 every repository is on the branch · 1 one of them is not.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GROUP_DIR="$(dirname "$ROOT_DIR")"

dry_run=0
again=0
for argument in "$@"; do
  case "$argument" in
    --dry-run) dry_run=1 ;;
    --again) again=1 ;;
    *) echo "неизвестный аргумент «$argument»; есть --dry-run и --again" >&2; exit 1 ;;
  esac
done

repos="${REPOS:-xor.ad sosed.place neighbro.place}"

for repo in $repos; do
  [ -d "$GROUP_DIR/$repo/.git" ] || {
    echo "нет репозитория $GROUP_DIR/$repo — проверьте REPOS" >&2
    exit 1
  }
done

# The maximum is taken across every repository before a single branch is made:
# asking one checkout what day it is gets a different answer than asking three.
highest=0
for repo in $repos; do
  while read -r number; do
    [ -n "$number" ] && [ "$number" -gt "$highest" ] && highest="$number"
  done < <(git -C "$GROUP_DIR/$repo" for-each-ref --format='%(refname:short)' \
             refs/heads refs/remotes \
           | sed -n 's#^\(origin/\)\?day\([0-9]\{1,\}\)$#\2#p')
done

[ "$highest" -gt 0 ] || {
  echo "ни в одном репозитории нет ветки вида dayN — назовите первую вручную" >&2
  exit 1
}

latest="day$highest"
today="$(date +%F)"

# The reflog of a branch begins with its creation. A fresh clone has no reflog
# for a branch it never created, and then the date is unknown — which counts as
# "not today", because inventing a day is the cheaper mistake to undo.
born=""
for repo in $repos; do
  checkout="$GROUP_DIR/$repo"
  git -C "$checkout" show-ref --verify --quiet "refs/heads/$latest" || continue
  entry="$(git -C "$checkout" reflog show --date=short "$latest" 2>/dev/null | tail -1)"
  date_seen="$(printf '%s' "$entry" | sed -n "s#.*$latest@{\([0-9-]\{10\}\)}.*#\1#p")"
  [ -n "$date_seen" ] || continue
  # The latest of the dates: opened today anywhere means the day is open.
  if [ -z "$born" ] || [ "$date_seen" \> "$born" ]; then
    born="$date_seen"
  fi
done

if [ "$born" = "$today" ] && [ "$again" = 0 ]; then
  branch="$latest"
  echo "$latest заведена сегодня ($born) — новую не создаю, свожу все репозитории на неё"
  echo "нужна ещё одна ветка этой же датой — scripts/new-day-branch.sh --again"
else
  branch="day$((highest + 1))"
  if [ "$again" = 1 ] && [ "$born" = "$today" ]; then
    echo "--again: $latest уже заведена сегодня, всё равно создаю $branch"
  else
    echo "самый поздний день во всех репозиториях — $latest${born:+ от $born}, новая ветка — $branch"
  fi
fi
echo

for repo in $repos; do
  checkout="$GROUP_DIR/$repo"
  current="$(git -C "$checkout" rev-parse --abbrev-ref HEAD)"

  # A detached HEAD would branch off a commit nobody named, and the report at
  # the end would still say the repository is on the day's branch.
  [ "$current" = "HEAD" ] && {
    echo "$repo: HEAD отделён — переключитесь на ветку и повторите" >&2
    exit 1
  }

  if [ "$current" = "$branch" ]; then
    echo "$repo: уже на $branch"
    continue
  fi

  if [ "$dry_run" = 1 ]; then
    if git -C "$checkout" show-ref --verify --quiet "refs/heads/$branch"; then
      echo "$repo: переключился бы на существующую $branch (сейчас $current)"
    else
      echo "$repo: создал бы $branch от $current"
    fi
    continue
  fi

  # An existing branch is switched to rather than skipped: afterwards all three
  # are on the same one, whichever way each of them got there.
  if git -C "$checkout" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$checkout" checkout "$branch" || exit 1
  else
    git -C "$checkout" checkout -b "$branch" || exit 1
  fi
done

echo
failed=0
for repo in $repos; do
  checkout="$GROUP_DIR/$repo"
  current="$(git -C "$checkout" rev-parse --abbrev-ref HEAD)"
  upstream="$(git -C "$checkout" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null || echo '—')"
  head="$(git -C "$checkout" rev-parse --short HEAD)"
  dirty="$(git -C "$checkout" status --porcelain | wc -l)"
  printf '%-16s ветка %-8s upstream %-14s head %-9s незакоммичено %s\n' \
    "$repo" "$current" "$upstream" "$head" "$dirty"
  [ "$dry_run" = 1 ] && continue
  [ "$current" = "$branch" ] || failed=1
  # An upstream on a shared branch is the failure this script exists to avoid.
  case "$upstream" in
    —|"origin/$branch") ;;
    *) echo "  upstream ведёт на $upstream — снимите: git -C $checkout branch --unset-upstream" >&2
       failed=1 ;;
  esac
done

exit "$failed"
