#!/usr/bin/env bash
# Runs the landing-page E2E suite in Docker (Playwright): drives the real
# waitlist form through the gateway and checks the email reaches Supabase.
# Assumes the gateway and Supabase stack are already running.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

docker compose -f docker-compose.landing-tests.yml build landing-tests
docker compose -f docker-compose.landing-tests.yml run --rm landing-tests
