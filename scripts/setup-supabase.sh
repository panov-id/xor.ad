#!/usr/bin/env bash
# Vendors the official Supabase self-hosted Docker stack into ./supabase.
# Source: https://github.com/supabase/supabase (docker/ subfolder only, sparse checkout).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/supabase"

if [ -d "$TARGET_DIR" ]; then
  echo "supabase/ already exists at $TARGET_DIR — remove it first if you want to re-vendor." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

git clone --depth 1 --filter=blob:none --sparse https://github.com/supabase/supabase.git "$TMP_DIR/supabase"
git -C "$TMP_DIR/supabase" sparse-checkout set docker

mkdir -p "$TARGET_DIR"
cp -R "$TMP_DIR/supabase/docker/." "$TARGET_DIR/"
cp "$TARGET_DIR/.env.example" "$TARGET_DIR/.env"

echo "Vendored the official Supabase self-hosted stack into $TARGET_DIR"
echo "It uses Supabase's published demo secrets in .env — fine for local dev only, never for a real deployment."
