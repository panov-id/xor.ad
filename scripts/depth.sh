#!/usr/bin/env bash
# Runs the terminal client in Docker, the way a person would run it.
#
#   scripts/depth.sh new           a new identity against the node in DEPTH_NODE_URL
#   scripts/depth.sh join          not yet: joining a second device needs the
#                                  Argon2id parameters, which are the owner's call
#
# DEPTH_NODE_URL and DEPTH_API_KEY say which node and which storefront's key.
# The language comes from the terminal's own LANG, as with every other command.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
what="${1:-new}"

case "$what" in
  new) ;;
  join)
    echo "depth join: ещё не работает. Привязка второго устройства выводит ключи из кода" >&2
    echo "  через Argon2id, а его параметры не выбраны (память: depth-terminal-client)." >&2
    exit 2
    ;;
  *) echo "usage: depth.sh [new|join]" >&2; exit 2 ;;
esac

: "${DEPTH_NODE_URL:?укажите адрес узла, например http://localhost:8080}"
: "${DEPTH_API_KEY:?укажите ключ витрины}"

docker build -q -t depth:local "$root/depth" >/dev/null
# The identity lives in this process only: the signing key is non-extractable,
# so there is nothing to mount and nothing left behind (§8.13 and the panel of
# 2026-09-21). Quitting means a new identity next time.
exec docker run --rm -it --network host \
  -e DEPTH_NODE_URL -e DEPTH_API_KEY -e DEPTH_ORIGIN_TOKEN -e LANG -e LC_ALL -e DEPTH_LANG \
  depth:local
