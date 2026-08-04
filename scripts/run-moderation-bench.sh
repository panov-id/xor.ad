#!/usr/bin/env bash
# Build and run the moderation measurement bench. Everything happens inside
# Docker: no model, dataset or python package touches the host.
#
#   scripts/run-moderation-bench.sh build      build the image and start the guard
#   scripts/run-moderation-bench.sh run        run the pipeline over samples.jsonl
#   scripts/run-moderation-bench.sh shell      a shell inside the bench container
#   scripts/run-moderation-bench.sh down       stop everything, keep the caches
#   scripts/run-moderation-bench.sh clean      stop and delete the caches too
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bench="$here/relay/moderation-bench"
compose=(docker compose -f "$bench/docker-compose.yml" --project-directory "$bench")

case "${1:-run}" in
  build)
    "${compose[@]}" build bench
    "${compose[@]}" up -d guard
    ;;
  run)
    "${compose[@]}" up -d guard
    "${compose[@]}" run --rm bench python pipeline.py \
      --input "${2:-samples.jsonl}" --output "${3:-results.jsonl}"
    ;;
  shell)
    "${compose[@]}" run --rm bench bash
    ;;
  down)
    "${compose[@]}" down
    ;;
  clean)
    "${compose[@]}" down --volumes
    ;;
  *)
    echo "неизвестная команда: $1" >&2
    exit 2
    ;;
esac
