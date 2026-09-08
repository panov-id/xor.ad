#!/usr/bin/env bash
# How many test cases exist, counted rather than remembered.
#
#   scripts/count-tests.sh            # the numbers
#   scripts/count-tests.sh --check    # and compare them with docs/test-map
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
total=$((node + e2e))

printf 'relay/node/test  %s\n' "$node"
printf 'testing/e2e      %s\n' "$e2e"
printf 'итого            %s\n' "$total"

[ "${1:-}" = "--check" ] || exit 0

# The map states both numbers; a document that names a count it cannot support
# is worse than one that names none, because it gets quoted.
problems=0
for pair in "relay/node/test|$node" "Итого|$total"; do
  label="${pair%%|*}"; want="${pair#*|}"
  line=$(grep -F "$label" "$root/docs/test-map_RU.md" | head -1)
  if ! printf '%s' "$line" | grep -qE "\b$want\b"; then
    printf '  ✗ карта говорит не %s: %s\n' "$want" "${line:0:90}"
    problems=$((problems + 1))
  fi
done

if [ "$problems" -gt 0 ]; then
  printf '\nрасхождений: %s — пересчитать и поправить docs/test-map_RU.md и пару\n' "$problems"
  exit 1
fi
printf '\nкарта называет те же числа\n'
