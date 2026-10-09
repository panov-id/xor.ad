#!/usr/bin/env bash
# probe.ts on Deno 2.1.4 and 2.5.6, 3 runs each, fresh Postgres per run, 120 s ceiling.
here="$(cd "$(dirname "$0")" && pwd)"
for img in alpine-2.1.4 alpine-2.5.6; do
  for run in 1 2 3; do
    net="pgp-net-$$-$run"; db="pgp-db-$$-$run"
    docker network create "$net" >/dev/null
    docker run -d --name "$db" --network "$net" --network-alias postgres \
      -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test postgres:16-alpine >/dev/null
    for _ in $(seq 40); do docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && break; sleep 0.5; done
    sleep 1
    out=$(timeout 120 docker run --rm --network "$net" -e DATABASE_URL=postgres://relay:test@postgres:5432/relay_test \
      -v "$here":/p -w /p "denoland/deno:$img" run --allow-all probe.ts 2>"$here/err-$img-$run.log"); rc=$?
    echo "deno $img · run $run · rc=$rc · ${out:-нет итога}"
    [ "$rc" = 0 ] || head -c 300 "$here/err-$img-$run.log" | tr '\n' ' ' | sed 's/^/    /'; [ "$rc" = 0 ] || echo
    docker rm -fv "$db" >/dev/null 2>&1; docker network rm "$net" >/dev/null 2>&1
  done
done
