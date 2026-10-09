#!/bin/bash
# Driver version x Deno version, 3 runs each; prints the first uncaught error kind per run.
here="$(cd "$(dirname "$0")" && pwd)"
tree="$here/tree/relay/node"
for drv in 3.4.4 3.4.7; do
  sed -i "s/npm:postgres@[0-9.]*/npm:postgres@$drv/" "$tree/src/lib/db.ts" "$tree/test/db_null_write.test.ts"
  for img in alpine-2.1.4 alpine-2.5.6; do
    for run in 1 2 3; do
      bash "$here/run-null-write.sh" "denoland/deno:$img" >/dev/null 2>&1
      kind=$(sed 's/\x1b\[[0-9;]*m//g' "$here/last.log" | grep -m1 -oE "TypeError: [^(]*|^error: \(in promise\) [A-Za-z]+: [a-z ]{0,40}|ok \| [0-9]+ passed" )
      echo "driver $drv · deno $img · run $run: ${kind:-?}"
    done
  done
done
sed -i "s/npm:postgres@[0-9.]*/npm:postgres@3.4.4/" "$tree/src/lib/db.ts" "$tree/test/db_null_write.test.ts"
git -C "$here/tree" status --short
