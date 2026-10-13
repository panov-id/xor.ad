#!/usr/bin/env bash
# Probe of the web kit ratchet (check-web-kit.sh). Works on a temp copy of web/
# (WEB_ROOT points the gate there); the real tree is never touched.
#   (a) clean copy is green;
#   (b) a raw <input> added to a screen is red and named as file:line;
#   (c) negative control: a known ui-* className stays green, an unknown one is red;
#       one from a kit sheet (src/ui/*.css) is green, one from a screen's sheet red;
#   (d) lowering below the baseline stays green (ratchet only blocks growth).
#
#   scripts/test_check-web-kit.sh
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
gate="$here/check-web-kit.sh"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
failures=0

fresh() {
  rm -rf "$work/web"; mkdir -p "$work/web"
  cp -r "$here/../web/src" "$work/web/src"
  cp "$here/../web/kit-baseline.tsv" "$work/web/kit-baseline.tsv"
}

expect() {  # expect <code> <text in output> <what>
  local output code; output=$(WEB_ROOT="$work/web" bash "$gate" 2>&1); code=$?
  if [ "$code" = "$1" ] && grep -qF -- "$2" <<< "$output"; then printf '  ✓ %s (rc=%s)\n' "$3" "$code"
  else printf '  ✗ %s — expected rc %s and «%s», got rc %s:\n%s\n' "$3" "$1" "$2" "$code" "$(printf '%s' "$output" | tail -4 | sed 's/^/      /')"; failures=$((failures + 1)); fi
}

screen="$work/web/src/screens/Splash.tsx"
vocab_class=$(grep -oE '\.ui-[A-Za-z0-9_-]+' "$here/../web/src/styles.css" | head -1 | sed 's/^\.//')

fresh; expect 0 "GREEN" "(a) clean tree — green"

fresh; printf '\nexport const Probe = () => <input type="text" />;\n' >> "$screen"
n=$(wc -l < "$screen")
expect 1 "screens/Splash.tsx:$((n)): raw <input> outside kit" "(b) added <input> — red, named file:line"

fresh; printf '\nexport const Probe = () => <p className="%s">x</p>;\n' "$vocab_class" >> "$screen"
expect 0 "GREEN" "(c1) className=\"$vocab_class\" (defined in styles.css) — stays green"

fresh; printf '\nexport const Probe = () => <p className="%s zz-unknown">x</p>;\n' "$vocab_class" >> "$screen"
expect 1 "outside kit vocabulary" "(c2) unknown className token — red"

fresh; printf '\nexport const Probe = () => <p className={`ui-not-defined-anywhere`}>x</p>;\n' >> "$screen"
expect 1 "ui-not-defined-anywhere" "(c3) ui-* name absent from styles.css — red (vocabulary is derived from CSS)"

fresh; printf '.ui-probe-kit-only { color: inherit; }\n' >> "$work/web/src/ui/form.css"
printf '\nexport const Probe = () => <p className="ui-probe-kit-only">x</p>;\n' >> "$screen"
expect 0 "GREEN" "(c4) ui-* defined only in a kit sheet (src/ui/*.css) — stays green"

fresh; printf '.ui-probe-screen-only { color: inherit; }\n' >> "$work/web/src/screens/splash.css"
printf '\nexport const Probe = () => <p className="ui-probe-screen-only">x</p>;\n' >> "$screen"
expect 1 "ui-probe-screen-only" "(c5) ui-* defined only in a screen's sheet — red (not the kit)"

fresh; printf '\nexport const Probe = () => <p>{/* <input> in a comment */}</p>; // <button> too\n' >> "$screen"
expect 0 "GREEN" "(d) tags in comments do not count — green"

if [ "$failures" -eq 0 ]; then echo "test_check-web-kit: all probes passed"; else echo "test_check-web-kit: $failures failed"; exit 1; fi
