#!/usr/bin/env bash
# Scaffolds the admin panel app (Refine + Supabase preset) into ./panel,
# using a throwaway Node container — nothing installed on the host.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -d "panel" ]; then
  echo "panel/ already exists — remove it first if you want to re-scaffold." >&2
  exit 1
fi

yes "" | docker run -i --rm -v "$ROOT_DIR:/workspace" -w /workspace node:22-bookworm \
  npx --yes create-refine-app@latest --preset refine-supabase --disable-telemetry panel

echo "Scaffolded panel/ — next: configure src/utility/supabaseClient.ts"
