#!/usr/bin/env bash
# Removes the images left by web stands before they took their images down
# (S1, 2026-09-27): only web-e2e-* and web-report-*, and never with -f, so an
# image a live run still uses stays and is named.
set -uo pipefail
mapfile -t images < <(docker images --format '{{.Repository}}:{{.Tag}}' | grep -E '^web-(e2e|report)-[0-9]+-')
echo "found ${#images[@]} images"
[ "${#images[@]}" -eq 0 ] && exit 0
removed=0; kept=0
for image in "${images[@]}"; do
  if docker rmi "$image" >/dev/null 2>&1; then removed=$((removed + 1)); else kept=$((kept + 1)); echo "kept (in use): $image"; fi
done
echo "removed $removed, kept $kept"
