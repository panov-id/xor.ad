#!/usr/bin/env bash
# Full frontend deploy: build the panel, then push all three targets to Bunny.
# Assumes the backend (Supabase Cloud) is already set up:
#   setup-supabase-cloud.sh → apply-migrations-cloud.sh → deploy-functions-cloud.sh
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"

bash "$DEPLOY_DIR/build-panel.sh"
bash "$DEPLOY_DIR/deploy-cdn.sh" sosed
bash "$DEPLOY_DIR/deploy-cdn.sh" neighbro
bash "$DEPLOY_DIR/deploy-cdn.sh" panel

echo "All frontends deployed."
