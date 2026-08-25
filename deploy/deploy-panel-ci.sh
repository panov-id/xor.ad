#!/usr/bin/env bash
# CI panel deploy: upload a prebuilt panel/dist to a Bunny Storage Zone, put the
# security headers on its Pull Zone and purge it. The Vite build (with
# VITE_RELAY_API_URL env) runs in the workflow before this. Reads plain env
# vars, no .env.deploy needed.
#
# Required env: BUNNY_STORAGE_ZONE, BUNNY_STORAGE_API_KEY, VITE_RELAY_API_URL,
#               BUNNY_PULL_ZONE_ID, BUNNY_API_KEY
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT_DIR/panel/dist"

: "${BUNNY_STORAGE_ZONE:?}"
: "${BUNNY_STORAGE_API_KEY:?}"
# Checked here rather than where it is used: the security policy names the one
# host the panel may talk to, and the value is baked into the bundle at build
# time, so the deploy has to be told it too. Failing before the first upload
# leaves the zone as it was instead of half-deployed.
: "${VITE_RELAY_API_URL:?}"
# An unset secret in Actions expands to an empty string rather than an error, so
# without these two the deploy used to ship a panel carrying no policy at all
# and purge the cache with a key that cannot purge — and report success either
# way. Checked up front for the same reason as the line above.
: "${BUNNY_PULL_ZONE_ID:?}"
: "${BUNNY_API_KEY:?}"
[ -d "$DIST" ] || { echo "panel/dist not found — build the panel first." >&2; exit 1; }

BASE_URL="https://storage.bunnycdn.com/${BUNNY_STORAGE_ZONE}"

mime_type() {
  case "$1" in
    *.html) echo "text/html; charset=utf-8" ;;
    *.js)   echo "application/javascript; charset=utf-8" ;;
    *.css)  echo "text/css; charset=utf-8" ;;
    *.json) echo "application/json; charset=utf-8" ;;
    *.svg)  echo "image/svg+xml" ;;
    *.png)  echo "image/png" ;;
    *.ico)  echo "image/x-icon" ;;
    *.woff2) echo "font/woff2" ;;
    *)      echo "application/octet-stream" ;;
  esac
}

# Before a single byte goes up: does the build contain only what we meant to
# publish? The prune that runs later removes what the build dropped and never
# questions what it kept — which is how five design sheets and three fonts came
# to be served from the production panel. A stranger stops the deploy here, where
# it costs nothing, instead of being discovered by a curl months later.
# Deep links are files, not a CDN trick. Bunny returns index.html for a missing
# path, but under 404 — measured on dev, uat and prod on 2026-08-25 — so every
# magic-link address answered "not found" while carrying the application. A file
# per declared route answers 200, and a path nobody declared still answers 404.
python3 "$ROOT_DIR/deploy/spa-route-files.py" "$DIST" "$ROOT_DIR/panel/src/App.tsx"

python3 "$ROOT_DIR/deploy/check-shipped-files.py" "$DIST" "$ROOT_DIR/deploy/panel-shipped.manifest"

echo "Deploying panel dist → Bunny zone '${BUNNY_STORAGE_ZONE}'"
# curl without --fail returns 0 on 401, 403 and 507, so the loop that used to be
# here reported a finished deploy over a zone that had not changed. That is
# worse for the panel than for a landing: the SPA fallback serves a missing
# /assets/*.js as index.html with a 200, so a half-finished upload is a blank
# screen rather than an error anyone can see.
#
# The failures are counted and reported once at the end, so the log names every
# file that did not land rather than only the first. The loop is fed by process
# substitution rather than a pipe, or the counter would live in a subshell of
# its own and come back zero.
( cd "$DIST"
  failed=0
  while IFS= read -r -d '' file; do
    rel="${file#./}"
    code="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
      -H "AccessKey: ${BUNNY_STORAGE_API_KEY}" \
      -H "Content-Type: $(mime_type "$file")" \
      --data-binary "@${file}" \
      "${BASE_URL}/${rel}" || true)"
    case "$code" in
      2*) echo "  → /${rel}" ;;
      *)  echo "  ✗ /${rel} — HTTP ${code:-no response}"; failed=$((failed + 1)) ;;
    esac
  done < <(find . -type f -print0)
  [ "$failed" -eq 0 ] || {
    echo "${failed} file(s) did not upload — the zone is now half-updated." >&2
    exit 1
  }
)

# Uploading is only half of a deploy. Until 2026-08-18 this script never deleted
# anything, so whatever had once been published stayed published: the dev zone
# held sixteen superseded bundles and five design mockups that no code
# referenced, and the mockups kept answering 200 long after the commit that
# removed them shipped. Purging does not help — the objects are in storage.
#
# It runs here, and only here, because this is the one place where the directory
# being compared is the directory that was just uploaded. Run against a locally
# built dist it would delete the live bundle, whose hash differs; the tool now
# refuses that, but the right place for it is still this one. It runs after the
# upload loop, which exits above if a single file failed — a half-finished
# upload must never be followed by a delete.
if [ "${SKIP_PRUNE:-}" = "1" ]; then
  echo "SKIP_PRUNE=1 — лишние файлы в зоне остаются как есть." >&2
else
  echo "Убираю из зоны то, чего нет в этой сборке…"
  # A prune that refuses or fails must not fail the deploy, and that is a lesson
  # from 2026-08-18: it runs after the upload, so making it fatal turned a
  # conservative refusal into a half-applied deploy — new bytes in the zone, the
  # edge rule still computed for the previous ones, and no purge. Extra files in
  # a zone are untidy; a policy that does not match the bundle is a blank panel.
  # The refusal is printed loudly and the deploy carries on.
  if ! BUNNY_STORAGE_API_KEY="$BUNNY_STORAGE_API_KEY" \
       python3 "$ROOT_DIR/deploy/prune-storage-zone.py" "$BUNNY_STORAGE_ZONE" "$DIST" --apply; then
    echo "  ⚠ уборка не выполнена — в зоне остаётся лишнее. Выкат продолжается." >&2
  fi
fi

# The header lives at the CDN edge, so a wrong hash is a page that does nothing
# in production and works everywhere else. It is computed from the dist that was
# just uploaded, and applied before the purge so the first request after the
# purge already gets the policy that matches those bytes.
# A way out when the header builder itself is wrong. Rolling back by code fixes a
# policy that is wrong for these bytes; it does nothing when every version
# computes the same broken policy, and the page is blank in production and fine
# everywhere else. Set SKIP_SECURITY_HEADERS=1 to ship the files and purge
# without touching the rule. The rule already on the zone stays as it is — use
# apply-edge-headers.py --remove to take it off.
if [ "${SKIP_SECURITY_HEADERS:-}" = "1" ]; then
  echo "SKIP_SECURITY_HEADERS=1 — the policy is left exactly as it is on the zone." >&2
else
echo "Building the security headers from the built panel…"
HEADERS_JSON="$(node "$ROOT_DIR/deploy/panel-security-headers.mjs" "$DIST")"
# Through the environment rather than argv: a key on the command line is visible
# in ps to every local account, and is the first thing to end up in a traceback.
export HEADERS_JSON BUNNY_API_KEY
python3 "$ROOT_DIR/deploy/apply-edge-headers.py" "$BUNNY_PULL_ZONE_ID"
fi

echo "Purging pull zone ${BUNNY_PULL_ZONE_ID}…"
# A purge that 401s leaves the edge serving the previous files under the policy
# just computed for the new ones — the hashes do not match and the panel does
# not load. Printing "cache purged" without looking is how that stayed invisible.
purge_code="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "AccessKey: ${BUNNY_API_KEY}" \
  "https://api.bunny.net/pullzone/${BUNNY_PULL_ZONE_ID}/purgeCache" || true)"
case "$purge_code" in
  2*) echo "  cache purged." ;;
  *)  echo "  cache NOT purged — HTTP ${purge_code:-no response}" >&2; exit 1 ;;
esac

echo "Panel deployed."
