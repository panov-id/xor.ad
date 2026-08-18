#!/usr/bin/env bash
# Exercise deploy-panel-ci.sh against a stubbed curl. No network, no Bunny.
#
#     bash deploy/test_deploy_panel_ci.sh
#
# What is under test is one thing: does the deploy notice an HTTP status it does
# not like? It used to not. `curl` without --fail returns 0 on 401, 403 and 507,
# so a deploy over a zone that rejected every byte printed "Panel deployed." and
# went green — and for the panel that is a blank screen, because the SPA
# fallback serves a missing asset as index.html with a 200.
#
# node and python3 are stubbed alongside curl: the header builder and the edge
# rule have their own test, and letting them run here would reach the network.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

failed=0

# A tree that looks enough like the repository for the script to run in it.
# Overridable so a deliberately broken copy can be run through the same cases —
# which is how each of these was watched go red before being trusted.
SCRIPT="${SCRIPT_UNDER_TEST:-$ROOT/deploy/deploy-panel-ci.sh}"

mkdir -p "$WORK/deploy" "$WORK/panel/dist/assets"
cp "$SCRIPT" "$WORK/deploy/deploy-panel-ci.sh"
echo '<!doctype html><script>1</script>' > "$WORK/panel/dist/index.html"
echo 'console.log(1)' > "$WORK/panel/dist/assets/index.js"

mkdir -p "$WORK/bin"

# The stub records every call and answers with whatever CURL_CODES says: one
# status per call, the last one repeating.
cat > "$WORK/bin/curl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CALL_LOG"
count="$(wc -l < "$CALL_LOG" | tr -d ' ')"
set -- $CURL_CODES
if [ "$count" -le "$#" ]; then
  eval "echo \${$count}"
else
  eval "echo \${$#}"
fi
STUB

cat > "$WORK/bin/node" <<'STUB'
#!/usr/bin/env bash
echo '{"headers":[{"name":"X-Test","value":"1"}],"counted":{"pages":1}}'
STUB

# Two different python3 callers now: the edge rule and the storage prune. The
# stub has to tell them apart, or a prune that fails would look like a deploy
# that succeeded — which is the whole thing being tested.
cat > "$WORK/bin/python3" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  *prune-storage-zone.py*)
    echo "  (stubbed prune)"
    exit "${PRUNE_CODE:-0}"
    ;;
  *)
    echo "  (stubbed edge rule)"
    ;;
esac
STUB

chmod +x "$WORK/bin/curl" "$WORK/bin/node" "$WORK/bin/python3"

attempt() {
  local name="$1" codes="$2" want_code="$3" want_text="$4"
  local log="$WORK/calls.txt"
  : > "$log"

  local output status
  output="$(cd "$WORK" && env PATH="$WORK/bin:$PATH" \
    CALL_LOG="$log" CURL_CODES="$codes" \
    PRUNE_CODE="${PRUNE_CODE:-0}" SKIP_PRUNE="${SKIP_PRUNE:-}" \
    BUNNY_STORAGE_ZONE=zone BUNNY_STORAGE_API_KEY=skey \
    BUNNY_PULL_ZONE_ID=99 BUNNY_API_KEY=akey \
    VITE_RELAY_API_URL=https://relay.example \
    bash deploy/deploy-panel-ci.sh 2>&1)"
  status=$?

  if [ "$status" -ne "$want_code" ]; then
    echo "  FAIL $name — exit $status, wanted $want_code"
    echo "$output" | sed 's/^/        /'
    failed=$((failed + 1))
    return
  fi
  if ! printf '%s' "$output" | grep -qF "$want_text"; then
    echo "  FAIL $name — output does not mention '$want_text'"
    echo "$output" | sed 's/^/        /'
    failed=$((failed + 1))
    return
  fi
  echo "  ok   $name"
}

echo "deploy-panel-ci, stubbed curl:"

# Everything answers 200.
attempt "a clean run reports success" "200" 0 "Panel deployed."

# The second file is rejected. The deploy must stop and say how many, and must
# not go on to purge a cache over a half-updated zone.
attempt "a rejected upload fails the deploy" "200 401" 1 "did not upload"

# Uploads fine, purge rejected: the edge would serve the previous files under
# the policy just computed for the new ones.
attempt "a rejected purge fails the deploy" "200 200 403" 1 "cache NOT purged"

# A 507 is the quota case, and the one curl is happiest to call success.
attempt "a 507 is not success" "507" 1 "did not upload"

# A prune that refuses or fails must NOT stop the deploy. It runs after the
# upload, so a fatal refusal leaves the zone uploaded, the edge rule computed for
# the previous bundle and the cache unpurged — which is how the UAT deploy broke
# on 2026-08-18. Extra files are untidy; a mismatched policy is a blank panel.
# The refusal has to be loud, though, or the zone quietly keeps its junk.
PRUNE_CODE=2 attempt "a refused prune does not stop the deploy" "200" 0 "уборка не выполнена"
PRUNE_CODE=1 attempt "a failed prune does not stop the deploy" "200" 0 "уборка не выполнена"
PRUNE_CODE=2 attempt "a refused prune still reaches the purge" "200" 0 "cache purged"

# And the way out, for the day the prune itself is the thing that is wrong.
SKIP_PRUNE=1 attempt "SKIP_PRUNE leaves the zone alone" "200" 0 "SKIP_PRUNE=1"

# The stub is checked too: a test that cannot fail proves nothing, so make sure
# a rejected upload really does stop before the purge.
: > "$WORK/calls.txt"
(cd "$WORK" && env PATH="$WORK/bin:$PATH" CALL_LOG="$WORK/calls.txt" CURL_CODES="200 401" \
  BUNNY_STORAGE_ZONE=zone BUNNY_STORAGE_API_KEY=skey BUNNY_PULL_ZONE_ID=99 \
  BUNNY_API_KEY=akey VITE_RELAY_API_URL=https://relay.example \
  bash deploy/deploy-panel-ci.sh >/dev/null 2>&1)
if grep -q purgeCache "$WORK/calls.txt"; then
  echo "  FAIL a failed upload still purged the cache"
  failed=$((failed + 1))
else
  echo "  ok   a failed upload never reaches the purge"
fi

# Each required variable, missing in turn, must stop the run before the first
# upload rather than midway through it.
ALL_VARS=(
  "BUNNY_STORAGE_ZONE=zone"
  "BUNNY_STORAGE_API_KEY=skey"
  "BUNNY_PULL_ZONE_ID=99"
  "BUNNY_API_KEY=akey"
  "VITE_RELAY_API_URL=https://relay.example"
)

for missing in BUNNY_STORAGE_ZONE BUNNY_STORAGE_API_KEY VITE_RELAY_API_URL \
               BUNNY_PULL_ZONE_ID BUNNY_API_KEY; do
  : > "$WORK/calls.txt"
  # Built by leaving one out rather than by unsetting it afterwards: `env
  # --unset=X X=1` still sets X, so the first version of this loop tested nothing.
  keep=()
  for pair in "${ALL_VARS[@]}"; do
    [ "${pair%%=*}" = "$missing" ] || keep+=("$pair")
  done
  (cd "$WORK" && env PATH="$WORK/bin:$PATH" CALL_LOG="$WORK/calls.txt" CURL_CODES="200" \
    "${keep[@]}" bash deploy/deploy-panel-ci.sh >/dev/null 2>&1)
  status=$?
  calls="$(wc -l < "$WORK/calls.txt" | tr -d ' ')"
  if [ "$status" -eq 0 ] || [ "$calls" -ne 0 ]; then
    echo "  FAIL missing $missing did not stop the run before uploading"
    failed=$((failed + 1))
  else
    echo "  ok   missing $missing stops the run before uploading"
  fi
done

echo
if [ "$failed" -ne 0 ]; then
  echo "FAILED: $failed"
  exit 1
fi
echo "deploy-panel-ci: every case passed"
