#!/usr/bin/env bash
# The project map as committed (owner 13.10.2026: «пересобирать эту карту как есть зафиксированные
# изменения»): build it from a snapshot of HEAD, not from the working tree with its unfinished edits.
#
#   scripts/map-on-commit.sh            # run by .git/hooks/post-commit in the background
#   scripts/install-git-hooks.sh        # installs that hook
#
# The snapshot goes to a temp dir via `git archive HEAD`; the generator writes into this
# checkout's docs/ (MAP_*.md, map.edges, map.sqlite with the commit's hash in builds).
# The log of the last run: .git/map-on-commit.log.
set -euo pipefail
root=$(git rev-parse --show-toplevel)
# Commits in quick succession start several runs at once; they wrote map.sqlite together and a
# build got lost (14.10.2026: four commits in one second, the last one never mapped). One run at a time.
exec 9>"$(git -C "$root" rev-parse --git-path map-on-commit.lock)"
flock 9
commit=$(git -C "$root" rev-parse --short HEAD)
# A run that waited may find HEAD already mapped by the one before it.
if [ -f "$root/docs/map.sqlite" ] &&
  [ -n "$(sqlite3 "$root/docs/map.sqlite" "SELECT 1 FROM builds WHERE git_commit = '$commit' LIMIT 1" 2>/dev/null)" ]; then
  echo "map already built for $commit"
  exit 0
fi
snap=$(mktemp -d)
trap 'rm -rf "$snap"' EXIT
# The snapshot dir carries the project's name: the map's title and builds.project use it.
mkdir "$snap/$(basename "$root")"
git -C "$root" archive HEAD | tar -x -C "$snap/$(basename "$root")"
MAP_COMMIT="$commit" MAP_GIT_DIR="$root" python3 "$root/scripts/project-map.py" "$snap/$(basename "$root")" --out "$root/docs" || true
echo "map built from $commit"
