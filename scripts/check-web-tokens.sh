#!/usr/bin/env bash
# WD1 gate: the web face takes every colour from the kit
# (panel/design/kit/tokens.css, schemes.css). A hex, rgb()/rgba() or hsl()
# anywhere in web/src is a colour of its own and turns this red.
set -euo pipefail
cd "$(dirname "$0")/.."
hits=$(grep -rnEI '#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(' web/src --include='*.css' --include='*.ts' --include='*.tsx' \
  | grep -vE '^[^:]+:[0-9]+:\s*(//|\*|/\*)' || true)
if [ -n "$hits" ]; then
  echo "check-web-tokens: RED — colours outside the kit tokens:"
  echo "$hits"
  exit 1
fi
echo "check-web-tokens: GREEN — web/src names no colour of its own"
