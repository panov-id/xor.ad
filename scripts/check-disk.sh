#!/usr/bin/env bash
# O10 (panel 03.10.2026): a full disk turned stand builds red as if a test had
# failed. Red here first, naming the mount, when a filesystem the builds use is
# at DISK_LIMIT percent or over (default 95): the repository's and docker's.
#
#   scripts/check-disk.sh            DISK_LIMIT=90 scripts/check-disk.sh
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
limit="${DISK_LIMIT:-95}"
paths=("$root")
[ -d /var/lib/docker ] && paths+=(/var/lib/docker)
# DF is replaceable so scripts/test_check-disk.sh can feed a full disk.
out=$("${DF:-df}" -P "${paths[@]}" 2>/dev/null) || { echo "df не ответил" >&2; exit 2; }
bad=0; seen=""
while read -r _ _ _ avail use mount; do
  pct="${use%\%}"
  case " $seen " in *" $mount "*) continue ;; esac
  seen="$seen $mount"
  if [ "$pct" -ge "$limit" ]; then
    echo "диск $mount занят на $pct% (порог $limit%), свободно $((avail / 1024)) МБ — сборки стендов упадут как красные тесты; почистить: docker builder prune, docker image prune" >&2
    bad=1
  fi
done < <(tail -n +2 <<< "$out")
[ "$bad" = 0 ] || exit 1
echo "диск: занято ниже $limit% на${seen}"
