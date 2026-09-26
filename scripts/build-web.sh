#!/usr/bin/env bash
# Build the web face's image inside Docker, nothing on the host (rule 12).
# Type check and vite build happen in the image (web/Dockerfile); the context
# is the repository root because the screens import depth/core.
#
#   scripts/build-web.sh                       # image xor-web:local
#   VITE_API_KEY=ak_pub_... scripts/build-web.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker build -f "$root/web/Dockerfile" \
  --build-arg "VITE_BRAND=${VITE_BRAND:-sosed}" \
  --build-arg "VITE_API_KEY=${VITE_API_KEY:-ak_pub_webdev00000000001}" \
  -t "${WEB_IMAGE:-xor-web:local}" "$root"
echo "built ${WEB_IMAGE:-xor-web:local}"
