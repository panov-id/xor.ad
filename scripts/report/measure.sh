#!/usr/bin/env bash
# Collect every number the report shows, by script, into $REPORT_WORK/data.
#
#   REPORT_WORK=<dir> scripts/report/measure.sh     # render.sh sets it
#
# Branch measured: $REPORT_BRANCH, default the branch checked out here.
set -uo pipefail
R="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
D="${REPORT_WORK:?set REPORT_WORK}/data"
mkdir -p "$D"
cd "$R"
BR="${REPORT_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"

# 1. Commits per day on the branch's lineage since 20.08
git log --format='%ad' --date=format:%Y-%m-%d --since=2026-08-20 "$BR" | sort | uniq -c \
  | awk '{print $2"\t"$1}' > "$D/commits_per_day.tsv"

# 2. Tests, migrations, spec operations at the last commit of each day
: > "$D/history.tsv"
for day in $(cut -f1 "$D/commits_per_day.tsv"); do
  c=$(git log -1 --format=%h --before="$day 23:59:59" "$BR")
  node=$(git grep -hE '^\s*(Deno\.test|configured|stored)\(' "$c" -- 'relay/node/test/*.ts' ':!relay/node/test/support/*' 2>/dev/null | wc -l)
  panel=$(git grep -hE '^\s*it\(' "$c" -- 'panel/src/*.ts' 'panel/src/*.tsx' 2>/dev/null | wc -l)
  pe2e=$(git grep -hE '^\s*test\(' "$c" -- 'panel/tests/e2e/*.ts' 'testing/e2e/*.ts' 2>/dev/null | wc -l)
  depth=$(git grep -hE '^\s*(Deno\.test|test|it)\(' "$c" -- 'depth/*.test.*' 'depth/**/*.test.*' ':!depth/node_modules' 2>/dev/null | wc -l)
  mig=$(git ls-tree --name-only "$c" relay/node/db/ 2>/dev/null | grep -c '\.sql$')
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$day" "$c" "$node" "$panel" "$pe2e" "$depth" "$mig" >> "$D/history.tsv"
done

# 3. Today's counts by the project's own counter
scripts/count-tests.sh > "$D/count-tests.txt" 2>&1

# 4. Contract: operations built vs spec only
bash scripts/check-openapi.sh > "$D/openapi.txt" 2>&1

# 5. Open registry by due and weight
grep -v '^#' docs/facts/open.tsv | awk -F'\t' 'NR>1' > "$D/open.tsv"

# 6. Live addresses
: > "$D/live.tsv"
for u in https://api.relay.panov.id/health https://report.relay.panov.id/health \
         https://sosed.place/ https://neighbro.place/ https://xor.panov.id/; do
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$u")
  printf '%s\t%s\n' "$u" "$code" >> "$D/live.tsv"
done
curl -s -m 15 https://api.relay.panov.id/health > "$D/prod-health.json"

# 7. Pool of nodes: recorded image vs running
# Its exit code is the verdict (0 only when every node answered and matched);
# the report files the pool under "checked" only on 0.
scripts/check-node-images.sh > "$D/node-images.txt" 2>&1; echo $? > "$D/node-images.rc"

# 8. Git state
{
  echo "branch=$BR"
  echo "head=$(git rev-parse --short "$BR")"
  echo "ahead_origin_day57=$(git rev-list --count "$BR" --not --remotes)"
  echo "day57_tail=$(git rev-list --count day57 --not --remotes)"
  echo "uncommitted=$(git status --porcelain | wc -l)"
  echo "upstream=$(git rev-parse --abbrev-ref "$BR@{u}" 2>/dev/null || echo none)"
  echo "measured=$(date '+%d.%m.%Y %H:%M')"
} > "$D/git.env"
git log --format='%h%x09%ad%x09%s' --date=format:'%d.%m %H:%M' "$BR" --not --remotes > "$D/unpushed.tsv"
echo "measure: $(ls "$D" | wc -l) files in $D"
