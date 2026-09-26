#!/usr/bin/env bash
# The node's copy of each storefront's legal revisions (GET /legal/manifest).
#
# The revisions are decided in the storefront repositories: each keeps
# deploy/legal-revisions.json — the date and the sha256 of the English original
# of the terms, the privacy policy and the guidelines — held against the
# documents by its own check-legal-revisions.py. The node serves them and checks
# an acceptance against them, so it carries a copy per brand in
# relay/node/legal/<brand>.json, shipped in its image (loop, 2026-09-24).
#
#   scripts/sync-legal-revisions.sh           copy from ../sosed.place and ../neighbro.place
#   scripts/sync-legal-revisions.sh --check   exit 1 if a copy differs from its storefront
#
# A storefront that is not beside this one is exit 3, not 0: until 2026-09-26 it
# printed "not checked" and exited 0, and check-all counted the unchecked copy
# as green.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$root/scripts/group-root.sh"; group="$(group_root "$root")"
check=0; [ "${1:-}" = "--check" ] && check=1
status=0; missing=0
for pair in sosed:sosed.place neighbro:neighbro.place; do
  brand="${pair%%:*}"; repo="${pair#*:}"
  source="$group/$repo/deploy/legal-revisions.json"
  copy="$root/relay/node/legal/$brand.json"
  if [ ! -f "$source" ]; then
    echo "  · $brand: $source not found — the storefront repository is not beside this one; not checked"
    missing=1
    continue
  fi
  if [ "$check" = 1 ]; then
    if cmp -s "$source" "$copy"; then echo "  ✓ $brand: the node's copy matches $repo"; else echo "  ✗ $brand: relay/node/legal/$brand.json differs from $repo/deploy/legal-revisions.json — run scripts/sync-legal-revisions.sh"; status=1; fi
  else
    cp "$source" "$copy"; echo "  copied $repo → relay/node/legal/$brand.json"
  fi
done
[ "$status" = 0 ] && [ "$missing" = 1 ] && { echo "  ✗ a storefront was not checked — that is not a pass" >&2; exit 3; }
exit $status
