#!/usr/bin/env bash
# Removes the terminal's dependency volumes left by older lockfiles.
#
# Each lockfile gets a volume of its own (`depth-node-modules-<hash>`), so a
# lockfile that moves leaves the previous tree behind. One is about 8 MB
# (measured 22.09.2026), which is small — but the disk on this box has been
# full once, and a directory nobody prunes is how that happened.
#
# The current lockfile's volume is kept; everything else goes. The Deno cache
# `depth-test-deno-cache` is shared by the core's suite and is left alone:
# 15 MB, and deleting it means downloading dependencies again on the next run.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
keep="depth-node-modules-$(sha1sum "$root/depth/package-lock.json" | cut -c1-12)"
gone=0
while read -r volume; do
  [ -z "$volume" ] && continue
  [ "$volume" = "$keep" ] && continue
  docker volume rm "$volume" >/dev/null 2>&1 && gone=$((gone + 1))
done < <(docker volume ls -q --filter "name=depth-node-modules-")
echo "удалено томов: $gone, оставлен: $keep"
