#!/usr/bin/env bash
# Shared helpers for the deploy scripts. Source this, then call load_env.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"

load_env() {
  local env_file="$DEPLOY_DIR/.env.deploy"
  if [ ! -f "$env_file" ]; then
    echo "Missing $env_file — copy deploy/.env.deploy.example and fill it in." >&2
    exit 1
  fi
  set -o allexport
  # shellcheck disable=SC1090
  source "$env_file"
  set +o allexport
}

# project_ref_from_url <https://ref.supabase.co> -> ref
project_ref_from_url() {
  local u="${1#https://}"
  echo "${u%%.supabase.co*}"
}
