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
# And the edge (B42, 2026-09-26): a firing probe evaluated well after for: is
# met passes whatever for: says — seven rules' probes did, and a for: made a
# minute longer went unnoticed (observer, B40). So every rule needs, within one
# test, an evaluation where it fires at T and one where it is quiet at T − 1m.
def seconds(text):
    return sum(int(n) * {"s": 1, "m": 60, "h": 3600, "d": 86400}[u] for n, u in re.findall(r"(\d+)([smhd])", text))
edged = set()
for block in re.split(r"\n(?=  - name: )", tests):
    evals = re.findall(r"- eval_time: (\S+)\s*\n\s*alertname: (\w+)\s*\n\s*exp_alerts:(.*)", block)
    fire_at = {(n, seconds(t)) for t, n, e in evals if e.strip() != "[]"}
    quiet_at = {(n, seconds(t)) for t, n, e in evals if e.strip() == "[]"}
    edged |= {n for n, t in fire_at if (n, t - 60) in quiet_at}

bad = covered = 0
for rule in rules:
    missing = [what for what, have in (("no probe where it fires", fires), ("no probe where it stays quiet", quiet),
                                       ("no probe quiet one minute before it fires", edged)) if rule not in have]
    if missing:
        print(f"✗ {rule}: {'; '.join(missing)} (alerts.test.yml)")
        bad += 1
    else:
        covered += 1
for name in sorted((fires | quiet) - set(rules)):
    print(f"✗ alerts.test.yml probes {name}, which alerts.yml does not have")
    bad += 1
print(f"alert probes: {len(rules)} rules, {covered} with a firing, a quiet and an edge probe")
sys.exit(1 if bad else 0)
PY

docker run --rm -v "$obs":/obs:ro -w /obs --entrypoint promtool \
  prom/prometheus:v2.53.0 test rules alerts.test.yml
