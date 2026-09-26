#!/usr/bin/env bash
# Unit tests for the alert rules: promtool in its own image, nothing on the host.
#
# check-metrics-exist.sh proves every name an alert uses is emitted; this proves
# the expressions do what their comments say, over series written down in
# relay/local/observability/alerts.test.yml.
#
# And first, that every rule has such series (B40, 2026-09-26): eleven of
# eighteen rules had no probe at all, and a rule nobody ever evaluated over a
# series is a comment, not an alert. Each rule needs one test where it fires
# and one where it stays quiet; a rule without either is named and the run is
# red before promtool starts.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
obs="$root/relay/local/observability"

python3 - "$obs/alerts.yml" "$obs/alerts.test.yml" <<'PY'
import re, sys
rules = re.findall(r"^\s+- alert: (\w+)", open(sys.argv[1]).read(), re.M)
tests = open(sys.argv[2]).read()
fires, quiet = set(), set()
# Each alert_rule_test entry: its alertname, then its exp_alerts — "[]" is quiet,
# anything else is an expectation that it fires.
for name, expected in re.findall(r"alertname: (\w+)\s*\n\s*exp_alerts:(.*)", tests):
    (quiet if expected.strip() == "[]" else fires).add(name)
bad = covered = 0
for rule in rules:
    missing = [what for what, have in (("no probe where it fires", fires), ("no probe where it stays quiet", quiet)) if rule not in have]
    if missing:
        print(f"✗ {rule}: {'; '.join(missing)} (alerts.test.yml)")
        bad += 1
    else:
        covered += 1
for name in sorted((fires | quiet) - set(rules)):
    print(f"✗ alerts.test.yml probes {name}, which alerts.yml does not have")
    bad += 1
print(f"alert probes: {len(rules)} rules, {covered} with both a firing and a quiet probe")
sys.exit(1 if bad else 0)
PY

docker run --rm -v "$obs":/obs:ro -w /obs --entrypoint promtool \
  prom/prometheus:v2.53.0 test rules alerts.test.yml
