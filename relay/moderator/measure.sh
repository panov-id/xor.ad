#!/usr/bin/env bash
# E2: the local moderator model against the corpus of the rules' measurement.
# The model (Ollama, qwen2.5:3b-instruct from the volume moderator-models)
# sits on a network with no way out — `internal`, no gateway — so a phrase
# never leaves this machine; the driver joins that network to ask it.
#
#   relay/moderator/measure.sh > report.json
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
image="denoland/deno:alpine-2.1.4"
network="moderator-measure-$$"
model="moderator-measure-model-$$"
cache="-v depth-test-deno-cache:/deno-dir -e DENO_DIR=/deno-dir"
cleanup() { docker rm -fv "$model" >/dev/null 2>&1 || true; docker network rm "$network" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker volume inspect moderator-models >/dev/null 2>&1 || { echo "no volume moderator-models: see relay/moderator/README_EN.md" >&2; exit 1; }
docker network create --internal "$network" >/dev/null
docker run -d --name "$model" --network "$network" --network-alias model \
  -v moderator-models:/root/.ollama ollama/ollama:0.3.14 >/dev/null
# No way out, checked rather than assumed: the model's container resolves no outside name.
if docker exec "$model" sh -c 'getent hosts registry.ollama.ai' >/dev/null 2>&1; then
  echo "the model's network reaches outside" >&2; exit 1
fi
echo "== model $(docker exec "$model" ollama list 2>/dev/null | awk 'NR==2{print $1}'), network internal" >&2
# shellcheck disable=SC2086
docker run --rm --network "$network" $cache \
  -e MODERATOR_URL=http://model:11434 \
  -v "$root":/repo:ro -w /repo "$image" \
  deno run --cached-only --allow-env --allow-net --allow-read relay/moderator/measure.ts
