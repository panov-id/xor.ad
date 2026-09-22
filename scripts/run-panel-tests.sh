#!/usr/bin/env bash
# Runs the panel E2E + responsive test suite in Docker (Playwright).
# Assumes the relay stand (relay/local) and the panel dev server are running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p testing/screenshots panel/tests/report panel/tests/results

# Run the container as the host user so screenshots/report aren't written as root.
export HOST_UID="$(id -u)" HOST_GID="$(id -g)"

# Two phrases for the feed-queue spec, sent through the front door with a
# stamp so a rerun on the long-lived stand does not meet yesterday's rows.
stamp="$(date +%s)"
export FEED_QUEUE_REFUSE_TEXT="e2e refuse ${stamp}" FEED_QUEUE_PUBLISH_TEXT="e2e publish ${stamp}" FEED_QUEUE_NAME_REFUSE_TEXT="e2e name ${stamp}"
scripts/seed-local-phrase.sh "$FEED_QUEUE_REFUSE_TEXT" >/dev/null
scripts/seed-local-phrase.sh "$FEED_QUEUE_PUBLISH_TEXT" >/dev/null
scripts/seed-local-phrase.sh "$FEED_QUEUE_NAME_REFUSE_TEXT" >/dev/null
docker compose -f docker-compose.panel-tests.yml build panel-tests
docker compose -f docker-compose.panel-tests.yml run --rm panel-tests

echo "Panel screenshots in testing/screenshots, HTML report in panel/tests/report"
