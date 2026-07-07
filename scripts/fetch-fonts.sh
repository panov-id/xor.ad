#!/usr/bin/env bash
# Self-host Google Fonts: fetch the exact woff2 subsets Google would serve and
# rewrite the @font-face src to local paths. Network runs in a container so
# nothing is installed on the host.
#
# Usage: fetch-fonts.sh <css_url> <font_dir> <url_prefix> <css_out>
#   css_url    the fonts.googleapis.com/css2 URL
#   font_dir   directory to save the .woff2 files into
#   url_prefix how the CSS should reference them (e.g. "fonts/" or "/fonts/")
#   css_out    path to write the rewritten @font-face CSS
set -euo pipefail

CSS_URL="$1"; FONT_DIR="$2"; URL_PREFIX="$3"; CSS_OUT="$4"
# A modern browser UA makes Google return woff2 (older UAs get ttf).
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
CURL=(docker run --rm curlimages/curl:latest -s)

mkdir -p "$FONT_DIR"
css="$("${CURL[@]}" -A "$UA" "$CSS_URL")"

urls=$(printf '%s\n' "$css" | grep -oE 'https://fonts\.gstatic\.com/[^)]+\.woff2' | sort -u)
count=0
for u in $urls; do
  base="$(basename "$u")"
  "${CURL[@]}" "$u" -o - > "$FONT_DIR/$base"
  css="${css//$u/${URL_PREFIX}${base}}"
  count=$((count + 1))
done

printf '%s\n' "$css" > "$CSS_OUT"
echo "Saved $count woff2 to $FONT_DIR; rewrote CSS -> $CSS_OUT"
