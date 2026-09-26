#!/usr/bin/env bash
# How many test cases exist, counted rather than remembered.
#
#   scripts/count-tests.sh            # the numbers
#   scripts/count-tests.sh --check    # accepted for check-all; the map is retired
#
# The map names its own counts, and rule 14 of the working agreement says a
# number in a document is recounted before it is repeated. It named
# `scratchpad/count-tests.sh` as the tool for that, and no such file has ever
# existed in the repository (checked 08.09.2026): the number was unverifiable by
# construction, and had already drifted.
#
# Cases are declared three ways and all three count:
#   Deno.test(...)   plain suites
#   configured(...)  suites that need an environment (test/support/config_env.ts)
#   stored(...)      the storage-backed variant of the same idea
# Registrations inside test/support/ are the helpers themselves, not cases.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

count_in() {  # count_in <directory> <pattern>
  grep -rhoE "$2" "$1" --include='*.ts' --include='*.mjs' --include='*.js' 2>/dev/null | wc -l
}

node_dir="$root/relay/node/test"
support="$node_dir/support"

node_all=$(count_in "$node_dir" '^\s*(Deno\.test|configured|stored)\(')
node_support=$(count_in "$support" '^\s*(Deno\.test|configured|stored)\(')
node=$((node_all - node_support))

e2e=$(count_in "$root/testing/e2e" '^\s*(test|Deno\.test)\(')
# The panel: vitest cases (`it(`) beside the code, and the Playwright specs.
# Neither was counted before 2026-09-22, so the map said "386" while 30-odd
# cases ran under a different runner.
panel_unit=$(count_in "$root/panel/src" '^\s*it\(')
panel_e2e=$(count_in "$root/panel/tests/e2e" '^\s*test\(')
total=$((node + e2e + panel_unit + panel_e2e))

printf 'relay/node/test  %s\n' "$node"
printf 'testing/e2e      %s\n' "$e2e"
printf 'panel/src        %s\n' "$panel_unit"
printf 'panel/tests/e2e  %s\n' "$panel_e2e"
printf 'итого            %s\n' "$total"

[ "${1:-}" = "--check" ] || exit 0

# Until 2026-09-26 --check compared these numbers with docs/test-map_RU.md. The
# map is no longer kept by hand (it sits in docs/archive/), so there is nothing
# to compare with: the numbers above are the only ones, and a document quoting
# them names this script as its source.
printf '\nкарта тестов не ведётся с 26.09.2026 — числа только здесь\n'
exit 0
