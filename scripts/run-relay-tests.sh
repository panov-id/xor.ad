#!/usr/bin/env bash
# Run the relay unit tests and type-check inside the same Deno image the node
# ships with, so nothing is installed on the host. Optional args are passed to
# `deno test` (e.g. --filter "access").
#
# Everything here runs with no database, which is a real configuration and must
# keep working. The suites that need one are the --ignore list of `deno task
# test` in relay/node/deno.json, and are skipped here — run them with
# scripts/run-relay-database-tests.sh, which brings its own Postgres. Each
# refuses to run without one rather than skipping quietly, because a suite that
# skips looks exactly like a suite that passes.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image="denoland/deno:alpine-2.1.4"

# The linter runs first, and it runs here rather than only in CI. On 2026-09-21
# CI was the first thing to see three lint problems on this branch (an `async`
# with nothing to await, two unused bindings) because no local run ever called
# `deno lint` — the whole session went by without it. A check that only the
# pipeline performs is a check you learn about after the push.
docker run --rm -v "$root/relay/node":/node -w /node "$image" lint

docker run --rm \
  -v "$root/relay/node":/node \
  -w /node \
  "$image" \
  sh -c 'deno check $(find src tools -name "*.ts")'

# Three suites read the documents they check the code against — the snapshot
# columns, the length limits and the retention windows — with paths that resolve
# to /docs from inside the container. Mounting only the node left those six tests
# failing on every local run since they were written, while CI ran them green off
# a full checkout: the script and the pipeline were testing different things, and
# the local half was the one nobody could read. Read-only: tests do not write docs.
#
# `deno task test`, and nothing else: the run CI performs (.github/workflows/
# relay.yml, "unit tests"). Until 2026-09-26 this script carried its own copy of
# the suites that need Postgres as an --ignore list, and the copy had drifted —
# it still split off tenancy.test.ts into a process of its own, which CI stopped
# doing when each suite began stating its own configuration. The list lives in
# one place now, relay/node/deno.json; scripts/check-db-suites.sh holds it to
# the suites that actually refuse to run without a database (B17).
docker run --rm \
  -v "$root/relay/node":/node \
  -v "$root/docs":/docs:ro \
  -w /node \
  "$image" \
  task test "$@"
