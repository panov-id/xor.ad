#!/usr/bin/env bash
# Cases for breaks_undo_left: a stale copy must not overwrite a file without the marker.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; . "${BREAKS_LIB:-$here/breaks.sh}"
d="$(mktemp -d)"; fails=0
# 1. file still broken → restored
printf 'good\n' > "$d/f1.orig"; printf 'x // BROKEN by test\n' > "$d/f1"; mkdir "$d/p1"; cp "$d/f1.orig" "$d/p1/orig"; printf '%s' "$d/f1" > "$d/p1/file"
breaks_undo_left "$d/p1" 2>/dev/null
[ "$(cat "$d/f1")" = good ] && [ ! -d "$d/p1" ] && echo "ok  1 broken file restored" || { echo "FAIL 1"; fails=1; }
# 2. file already clean (newer tree) → untouched, pending dropped
printf 'old\n' > "$d/p2orig"; printf 'new code\n' > "$d/f2"; mkdir "$d/p2"; cp "$d/p2orig" "$d/p2/orig"; printf '%s' "$d/f2" > "$d/p2/file"
breaks_undo_left "$d/p2" 2>/dev/null
[ "$(cat "$d/f2")" = "new code" ] && [ ! -d "$d/p2" ] && echo "ok  2 stale copy dropped, file kept" || { echo "FAIL 2: $(cat "$d/f2")"; fails=1; }
# 3. no pending → no-op
breaks_undo_left "$d/none" && echo "ok  3 no pending" || { echo "FAIL 3"; fails=1; }
rm -rf "$d"; exit $fails
