#!/usr/bin/env bash
# Follow the GitHub Actions runs for a commit, and refuse to talk about anything
# else.
#
#   scripts/watch-run.sh <repo> <ref>
#   scripts/watch-run.sh xor.ad day34
#   scripts/watch-run.sh neighbro.place origin/dev
#   REPOS="xor.ad neighbro.place sosed.place" scripts/watch-run.sh --all origin/dev
#
# Why it exists: on 2026-08-19 a watcher was repointed with sed from one branch
# to another, one edit was missed, and it reported "all runs finished" from
# yesterday's runs on a different branch. It was believed for a minute.
#
# So the commit is resolved locally first and every run is matched on head_sha.
# A branch name is never enough: it names a moving target, and the answer wanted
# is about the thing that was just pushed. If no run exists for that sha yet the
# script says so and keeps waiting; it never falls back to "the latest run".
#
# Exit 0 every run succeeded · 1 some failed · 3 timed out · 4 the API refused.
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT_DIR/deploy/.env.deploy"; set +a

if [ "${1:-}" = "--all" ]; then
  shift
  repos="${REPOS:-xor.ad neighbro.place sosed.place}"
else
  repos="${1:?укажите репозиторий, например xor.ad}"
  shift
fi
ref="${1:?укажите ref: ветку, тег или sha}"
attempts="${WATCH_ATTEMPTS:-40}"
pause="${WATCH_PAUSE:-20}"

declare -A shas
for repo in $repos; do
  checkout="/home/eugene-panov/Projects/panov-id/$repo"
  sha="$(git -C "$checkout" rev-parse "$ref" 2>/dev/null)" || {
    echo "в $repo нет ref «$ref» — уточните, за чем следить" >&2
    exit 4
  }
  shas[$repo]="$sha"
  printf '  %-16s %s = %s\n' "$repo" "$ref" "${sha:0:7}"
done
echo

for attempt in $(seq 1 "$attempts"); do
  printf '\n--- опрос %s ---\n' "$attempt"
  pending=0
  failed=0
  for repo in $repos; do
    printf '%s:\n' "$repo"
    curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/panov-id/$repo/actions/runs?head_sha=${shas[$repo]}&per_page=20" \
    | python3 -c "
import json, sys
payload = json.load(sys.stdin)
if not isinstance(payload, dict) or 'workflow_runs' not in payload:
    print(f'  ОТКАЗ API: {str(payload)[:140]}'); raise SystemExit(4)
runs = payload['workflow_runs']
if not runs:
    print('  прогонов по этому коммиту ещё нет'); raise SystemExit(3)
done, bad = True, False
for run in runs:
    mark = {'success': '✓', 'failure': '✗', 'cancelled': '⊘', 'skipped': '–'}.get(run['conclusion'], '…')
    print(f\"  {mark} {run['name']:<18} {run['status']:<12} {run['conclusion'] or ''}\")
    if run['status'] != 'completed': done = False
    if run['conclusion'] in ('failure', 'cancelled'): bad = True
raise SystemExit(0 if done and not bad else (1 if done else 3))
"
    case $? in
      0) ;;
      1) failed=1 ;;
      4) exit 4 ;;
      *) pending=1 ;;
    esac
  done
  if [ "$pending" -eq 0 ]; then
    [ "$failed" -eq 0 ] && { echo; echo "все прогоны прошли"; exit 0; }
    echo; echo "прогоны завершились, есть упавшие" >&2; exit 1
  fi
  sleep "$pause"
done

echo "не дождался за $attempts опросов" >&2
exit 3
