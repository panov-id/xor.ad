#!/usr/bin/env bash
# Shared helpers for the deploy scripts. Source this, then call load_env.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

# Local runs read deploy/.env.deploy; CI sets the same vars in the environment
# directly, so the file is optional when the needed vars are already present.
load_env() {
  local env_file="$DEPLOY_DIR/.env.deploy"
  if [ -f "$env_file" ]; then
    set -o allexport
    # shellcheck disable=SC1090
    source "$env_file"
    set +o allexport
  elif [ -z "${CI:-}" ]; then
    echo "Missing $env_file — copy deploy/.env.deploy.example and fill it in." >&2
    exit 1
  fi
}
