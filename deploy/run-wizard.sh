#!/usr/bin/env bash
# Non-interactive driver for deploy/wizard.py: feeds its prompts from
# deploy/.env.deploy so an environment can be provisioned in one command.
#   deploy/run-wizard.sh <dev|uat|prod>
# Needs in .env.deploy: BUNNY_API_KEY, SUPABASE_ACCESS_TOKEN,
# SUPABASE_PROJECT_REF, GITHUB_TOKEN.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/.env.deploy"
ENV="${1:?Usage: run-wizard.sh <dev|uat|prod>}"

[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE"; exit 1; }
set -a; . "$ENV_FILE"; set +a

: "${BUNNY_API_KEY:?set BUNNY_API_KEY in .env.deploy}"
: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN in .env.deploy}"
: "${SUPABASE_PROJECT_REF:?set SUPABASE_PROJECT_REF in .env.deploy}"
: "${GITHUB_TOKEN:?set GITHUB_TOKEN in .env.deploy}"

# The wizard reads five lines: env, bunny key, supabase token, project ref, github token.
printf '%s\n%s\n%s\n%s\n%s\n' \
  "$ENV" "$BUNNY_API_KEY" "$SUPABASE_ACCESS_TOKEN" "$SUPABASE_PROJECT_REF" "$GITHUB_TOKEN" | \
docker run --rm -i \
  -v "$DEPLOY_DIR/wizard.py:/app/wizard.py:ro" \
  -v "$ROOT_DIR:/repo:ro" \
  -w /app python:3.12-alpine \
  sh -c "pip install -q PyNaCl requests && python3 wizard.py"
