#!/usr/bin/env bash
# E2b: does the model answer the same twice? The corpus through measure.sh two
# times, one model start each, and the verdicts compared phrase by phrase.
# Prints one JSON line: how many phrases, how many agreed, and each one that
# did not, with both answers. The two full reports stay in the given folder.
#
#   relay/moderator/repeat.sh <folder for run-1.json and run-2.json>
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
out="${1:?a folder for the two reports}"
mkdir -p "$out"
"$here/measure.sh" > "$out/run-1.json"
"$here/measure.sh" > "$out/run-2.json"
docker run --rm -v "$out":/r:ro denoland/deno:alpine-2.1.4 eval '
  const a = JSON.parse(Deno.readTextFileSync("/r/run-1.json")).verdicts;
  const b = JSON.parse(Deno.readTextFileSync("/r/run-2.json")).verdicts;
  if (a.length !== b.length) throw new Error(`runs differ in length: ${a.length} vs ${b.length}`);
  const differ = a.flatMap((x, i) => x.verdict === b[i].verdict ? [] : [{ klass: x.klass, text: x.text, first: x.verdict, second: b[i].verdict }]);
  console.log(JSON.stringify({ phrases: a.length, agreed: a.length - differ.length, differ }));
'
