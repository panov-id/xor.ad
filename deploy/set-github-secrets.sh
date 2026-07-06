#!/usr/bin/env bash
# Push GitHub Actions environment secrets for all repos/environments from
# deploy/github-secrets.json, in a throwaway Python container (PyNaCl+requests).
#
# The GitHub token needs: Environments (write) + Secrets (write) on each repo.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG="$DEPLOY_DIR/github-secrets.json"

[ -f "$CONFIG" ] || { echo "Missing $CONFIG — copy deploy/github-secrets.example.json and fill it in." >&2; exit 1; }

docker run --rm \
  -v "$CONFIG:/config/github-secrets.json:ro" \
  -v "$DEPLOY_DIR/set-github-secrets.py:/app/set-github-secrets.py:ro" \
  -w /app python:3.12-alpine \
  sh -c "pip install -q PyNaCl requests && python3 set-github-secrets.py"
