#!/usr/bin/env bash
# Builds and runs the Playwright visual-testing container, writing
# responsive/dark-light screenshots of both landing pages to
# ./testing/screenshots.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p testing/screenshots

docker compose -f docker-compose.testing.yml build visual-tests
docker compose -f docker-compose.testing.yml run --rm visual-tests

echo "Screenshots written to $ROOT_DIR/testing/screenshots"
