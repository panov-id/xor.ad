#!/usr/bin/env bash
# Interactive prod wizard for the landings: provisions Bunny zones, applies
# Supabase migrations, and sets GitHub production secrets for both faces.
# Runs in a throwaway Python container (interactive) — nothing on the host.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

docker run --rm -it \
  -v "$DEPLOY_DIR/wizard.py:/app/wizard.py:ro" \
  -v "$ROOT_DIR:/repo:ro" \
  -w /app python:3.12-alpine \
  sh -c "pip install -q PyNaCl requests && python3 wizard.py"
