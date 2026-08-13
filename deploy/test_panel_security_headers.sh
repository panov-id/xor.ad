#!/usr/bin/env bash
# Exercise panel-security-headers.mjs against fixture markup. No network.
#
#     bash deploy/test_panel_security_headers.sh
#
# This script decides what the panel is allowed to do in production, and it is
# the only place that decides it — the header lives at the CDN edge, so no local
# server sends it and no browser check runs before a deploy. A mistake here is a
# blank panel reached by a link from an email.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILDER="${BUILDER_UNDER_TEST:-$ROOT/deploy/panel-security-headers.mjs}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

failed=0

pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1 — $2"; failed=$((failed + 1)); }

# Two fixtures: the panel as it is (one inline script, no styles at all), and a
# panel that has grown a style attribute.
mkdir -p "$WORK/plain" "$WORK/styled"
printf '%s' '<!doctype html><html><head><script>window.x=1</script><script src="/a.js"></script></head><body></body></html>' \
  > "$WORK/plain/index.html"
printf '%s' '<!doctype html><html><body><div style="color:red">x</div><script>window.x=1</script></body></html>' \
  > "$WORK/styled/index.html"

build() { # build <dist> <relay> -> prints JSON on success
  VITE_RELAY_API_URL="$2" node "$BUILDER" "$1" 2>&1
}

# --- the value of the relay address ------------------------------------------

for bad_value in "https://relay.example/v1" "not a url" "https://relay.example ; script-src *" ""; do
  output="$(build "$WORK/plain" "$bad_value")"
  status=$?
  label="refuses relay value '${bad_value:-<empty>}'"
  if [ $status -eq 0 ]; then
    fail "$label" "exited 0"
  elif ! printf '%s' "$output" | grep -qiE 'not a usable CSP source|is not set'; then
    fail "$label" "message does not explain: $output"
  else
    pass "$label"
  fi
done

output="$(build "$WORK/plain" "https://relay.example/")"
if [ $? -ne 0 ]; then
  fail "a trailing slash is accepted" "$output"
else
  pass "a trailing slash is accepted"
fi

# --- what the policy says ----------------------------------------------------

GOOD="$(build "$WORK/plain" "https://relay.example")"
if [ $? -ne 0 ]; then
  echo "  FAIL a valid origin builds — $GOOD"
  echo "FAILED: 1"
  exit 1
fi
pass "a valid origin builds"

printf '%s' "$GOOD" > "$WORK/plain.json"
python3 - "$WORK/plain.json" <<'PY'
import json, sys

data = json.load(open(sys.argv[1]))
headers = {h["name"]: h["value"] for h in data["headers"]}
csp = headers["Content-Security-Policy"]
failed = 0

def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")

expected = [
    "Content-Security-Policy", "Reporting-Endpoints", "Strict-Transport-Security",
    "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy",
]
check("seven headers, in order",
      [h["name"] for h in data["headers"]] == expected,
      str([h["name"] for h in data["headers"]]))

# Both spellings: Chrome honours one, Firefox and Safari the other, and a policy
# that kills the page in either is worth hearing about.
check("report-uri names the relay",
      "report-uri https://relay.example/csp-report" in csp, csp)
check("report-to names the group", "report-to csp" in csp, csp)
check("the group is defined",
      headers["Reporting-Endpoints"] == 'csp="https://relay.example/csp-report"',
      headers["Reporting-Endpoints"])

# The panel has no style attributes, so it must not be handed the loosening that
# covering one would require.
check("no 'unsafe-hashes' when there are no style attributes",
      "unsafe-hashes" not in csp, csp)
check("style-src stays bare", "style-src 'self';" in csp + ";", csp)
check("the inline script is hashed", "script-src 'self' 'sha256-" in csp, csp)
check("the external script is not hashed", data["counted"]["inline_scripts"] == 1,
      str(data["counted"]))
check("connect-src is the bare origin",
      "connect-src 'self' https://relay.example;" in csp + ";", csp)

sys.exit(1 if failed else 0)
PY
[ $? -eq 0 ] || failed=$((failed + 1))

# --- a panel that has grown a style attribute --------------------------------

STYLED="$(build "$WORK/styled" "https://relay.example")"
if [ $? -ne 0 ]; then
  fail "markup with a style attribute builds" "$STYLED"
else
  printf '%s' "$STYLED" > "$WORK/styled.json"
  python3 - "$WORK/styled.json" <<'PY'
import json, sys

data = json.load(open(sys.argv[1]))
csp = {h["name"]: h["value"] for h in data["headers"]}["Content-Security-Policy"]
failed = 0

def check(name, condition, detail=""):
    global failed
    if condition:
        print(f"  ok   {name}")
    else:
        failed += 1
        print(f"  FAIL {name} — {detail}")

check("the style attribute is counted", data["counted"]["style_attributes"] == 1,
      str(data["counted"]))
# Without 'unsafe-hashes' the hash beside it is decoration the browser ignores —
# the script would report covering the attribute while the browser blocked it.
check("'unsafe-hashes' appears once there is an attribute",
      "style-src 'self' 'unsafe-hashes' 'sha256-" in csp, csp)

sys.exit(1 if failed else 0)
PY
  [ $? -eq 0 ] || failed=$((failed + 1))
fi

echo
if [ "$failed" -ne 0 ]; then
  echo "FAILED: $failed"
  exit 1
fi
echo "panel-security-headers: every case passed"
