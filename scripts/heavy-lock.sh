#!/usr/bin/env bash
# One heavy run on this machine at a time: a second one waits here until the first ends. The kernel drops the lock when
# the holder dies, so a killed run leaves nothing to clean. HEAVY_LOCK_HELD lets a script re-enter itself under the lock.
#
#   scripts/heavy-lock.sh scripts/flow/crowd.sh
set -uo pipefail
[ $# -ge 1 ] || { echo "usage: heavy-lock.sh <command> [args...]"; exit 2; }
lock="${HEAVY_LOCK_FILE:-${TMPDIR:-/tmp}/xor-heavy-run.lock}"
exec 9>>"$lock"
if ! flock -n 9; then
  echo "heavy-lock: another heavy run holds $lock; waiting"
  flock 9
fi
export HEAVY_LOCK_HELD=1
exec "$@"
