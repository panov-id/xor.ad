#!/usr/bin/env bash
# Unit tests for the alert rules: promtool in its own image, nothing on the host.
#
# check-metrics-exist.sh proves every name an alert uses is emitted; this proves
# the expressions do what their comments say, over series written down in
# relay/local/observability/alerts.test.yml.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
obs="$root/relay/local/observability"
docker run --rm -v "$obs":/obs:ro -w /obs --entrypoint promtool \
  prom/prometheus:v2.53.0 test rules alerts.test.yml
