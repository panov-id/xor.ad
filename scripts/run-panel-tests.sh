#!/usr/bin/env bash
# Runs the panel E2E + responsive test suite in Docker (Playwright).
# Assumes the Supabase stack and the panel dev server are already running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p testing/screenshots panel/tests/report

docker compose -f docker-compose.panel-tests.yml build panel-tests
docker compose -f docker-compose.panel-tests.yml run --rm panel-tests

echo "Panel screenshots in testing/screenshots, HTML report in panel/tests/report"
