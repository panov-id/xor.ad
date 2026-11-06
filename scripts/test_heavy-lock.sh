#!/usr/bin/env bash
# scripts/heavy-lock.sh: two runs at once do not overlap, the second says it waits, the exit code comes through,
# and a killed holder frees the lock. LOCK_SCRIPT points it at a broken copy, to watch it go red.
set -uo pipefail
lockscript="${LOCK_SCRIPT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/heavy-lock.sh}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
export HEAVY_LOCK_FILE="$tmp/lock"
fail=0
bad() { echo "FAIL: $1"; fail=1; }

job='echo start >> "$1"; sleep 1; echo end >> "$1"'
bash "$lockscript" bash -c "$job" _ "$tmp/log" > "$tmp/a.out" 2>&1 &
a=$!
sleep 0.3
bash "$lockscript" bash -c "$job" _ "$tmp/log" > "$tmp/b.out" 2>&1 &
b=$!
wait $a $b
[ "$(tr '\n' ' ' < "$tmp/log")" = "start end start end " ] || bad "runs overlapped: $(tr '\n' ' ' < "$tmp/log")"
grep -q "waiting" "$tmp/b.out" || bad "the second run did not say it waits"

bash "$lockscript" bash -c 'exit 7'; [ $? -eq 7 ] || bad "the exit code did not come through"

bash "$lockscript" sleep 30 > /dev/null 2>&1 &
c=$!
sleep 0.3
kill -9 $c; wait $c 2>/dev/null
timeout 5 bash "$lockscript" true > /dev/null 2>&1 || bad "a killed holder kept the lock"

[ $fail -eq 0 ] && echo "heavy-lock: 4 of 4 ok"
exit $fail
