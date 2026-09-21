#!/usr/bin/env bash
# Every metric named by an alert rule or a dashboard panel must be one the node
# actually emits.
#
# promtool checks that an expression parses. It cannot check that
# `relay_dsa_queue_open` is a series anybody writes — and on 2026-09-20 it was
# not: two metric names were written into an alert rule before they existed, so
# the rule was a promise to page nobody. Prometheus answers a query for an
# unknown series with an empty vector, which is indistinguishable from "all is
# well", so nothing anywhere would have said so.
#
# This compares the names used in relay/local/observability against the names
# `inc()` and `setGauge()` are called with in relay/node/src.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
obs="$root/relay/local/observability"
src="$root/relay/node/src"

# `clearGauge` counts as emitting: a gauge that is cleared is one the node knows
# about and deliberately removes — lib/queue_metrics.ts does exactly that when
# a queue is empty, and leaving it out of this list made the first run of this
# gate report two live series as missing.
#
# The call is also written across several lines when the arguments are long, so
# the name is matched on its own rather than as part of a call.
emitted="$(grep -rhoE '(inc|setGauge|clearGauge)\(\s*"relay_[a-z_]+"' "$src" \
  | sed -E 's/.*"(relay_[a-z_]+)".*/\1/' | sort -u)
$(grep -rhoE '^\s*"relay_[a-z_]+",' "$src" | sed -E 's/.*"(relay_[a-z_]+)".*/\1/' | sort -u)"
emitted="$(sort -u <<<"$emitted")"

used="$( { grep -rhoE 'relay_[a-z_]+' "$obs/alerts.yml"
           grep -rhoE 'relay_[a-z_]+' "$obs/grafana/dashboards" ; } \
  | sort -u )"

missing=""
for name in $used; do
  # The dashboard's own uid and file names start with relay_ too; only names
  # that look like a series are checked, and a series is what a rule queries.
  if ! grep -qx "$name" <<<"$emitted"; then
    missing="$missing $name"
  fi
done

if [ -n "$missing" ]; then
  echo "РЯДЫ, КОТОРЫХ УЗЕЛ НЕ ИСПУСКАЕТ:"
  for name in $missing; do
    echo "  ✗ $name — назван в тревогах или на дашборде, но в relay/node/src его никто не пишет"
  done
  echo
  echo "Правило по несуществующему ряду не сработает никогда: Prometheus ответит"
  echo "пустым вектором, и это неотличимо от «всё хорошо»."
  exit 1
fi

echo "рядов испускается: $(wc -w <<<"$emitted"), названо в наблюдаемости: $(wc -w <<<"$used") — все названные существуют"
