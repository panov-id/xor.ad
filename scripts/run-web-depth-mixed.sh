#!/usr/bin/env bash
# Q6: the two people's path with one of them in the terminal. The web stand of
# docker-compose.web.yml (node, every migration, seed, the page); Аня in a
# browser (web/e2e/specs/mixed-depth.spec.ts) and Борис in the depth screens
# (depth/ink/mixed.node-test.ts) against the same node, at the same time. They
# take turns through files in web/e2e/results/mixed-sync-<project>. Exit code is 0 only
# when both sides pass.
#
#   scripts/run-web-depth-mixed.sh
#
# The project name carries this run's PID, so two runs do not share a stand.
set -uo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project="web-mixed-$$"
compose=(docker compose -f "$root/docker-compose.web.yml" -p "$project")
node_image="node:24.21.0-alpine"
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"
# This run's own folder and log: two runs side by side must not read each
# other's steps (T1b, as results/run-* in playwright.config.ts).
sync="$root/web/e2e/results/mixed-sync-$project"
depth_log="$root/web/e2e/results/mixed-depth-$project.log"
# Letters only: a run of digits in a phrase reads as a phone number to the
# queue's rules, and the phrase then waits for a human (measured: "checking").
run_id="$(printf '%s%s' "$(date +%s)" "$$" | tr 0-9 a-j)"
depth_name="web-mixed-depth-$$"
mkdir -p "$root/web/e2e/results"
# What runs a day old left behind: nothing reads it, and it is never committed.
find "$root/web/e2e/results" -mindepth 1 -maxdepth 1 \( -name 'run-*' -o -name 'mixed-sync-*' -o -name 'mixed-depth-*.log' \) \
  -mmin +1440 -exec rm -rf {} + 2>/dev/null || true
rm -rf "$sync"; mkdir -p "$sync"; chmod 777 "$sync"
cleanup() {
  docker rm -f "$depth_name" >/dev/null 2>&1 || true
  "${compose[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM
echo "== build and start: postgres, migrations, seed, node, web"
"${compose[@]}" build e2e web web-adv node >/dev/null || exit 1
# The panel too, before the terminal starts its clock: e2e depends on it, and
# brought up by "run e2e" it came after Борис had given up waiting (T1b).
"${compose[@]}" up -d --wait web web-adv panel || exit 1

# The terminal's dependencies, as scripts/run-depth-live-ui.sh keeps them: a
# volume per lockfile, installed once.
lock_hash="$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
mods="depth-node-modules-$lock_hash:/repo/depth/node_modules"
timeout 300 docker run --rm -v "$root":/repo -v "$mods" -w /repo/depth "$node_image" \
  sh -c '[ -f node_modules/.lock-ok ] || { npm ci --no-audit --no-fund && touch node_modules/.lock-ok; }' >/dev/null || exit 1

echo "== Аня in the browser, Борис in the terminal"
docker run --name "$depth_name" --network "${project}_default" -v "$mods" \
  -e DEPTH_NODE_URL=http://node:8080 -e DEPTH_API_KEY=ak_pub_webtest0000000001 \
  -e MIXED_SYNC="/repo/web/e2e/results/mixed-sync-$project" -e MIXED_RUN="$run_id" \
  -v "$root":/repo -w /repo/depth "$node_image" \
  timeout 400 node --experimental-transform-types ink/mixed.node-test.ts >"$depth_log" 2>&1 &
depth_pid=$!
"${compose[@]}" run --rm -e MIXED_RUN="$run_id" -e MIXED_SYNC="/app/results/mixed-sync-$project" e2e npx playwright test specs/mixed-depth.spec.ts
web_status=$?
wait "$depth_pid"; depth_status=$?
echo "── terminal side ──"; cat "$depth_log"
if [ "$web_status" -ne 0 ] || [ "$depth_status" -ne 0 ]; then
  echo "── node log (tail) ──" >&2; "${compose[@]}" logs --no-color --tail 40 node >&2
fi
echo "== browser $web_status, terminal $depth_status"
[ "$web_status" = 0 ] && [ "$depth_status" = 0 ]
