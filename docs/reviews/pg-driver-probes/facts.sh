#!/usr/bin/env bash
# facts.ts against a throwaway Postgres, Deno 2.1.4, TZ=Asia/Nicosia (not UTC).
here="$(cd "$(dirname "$0")" && pwd)"
net="pgf-net-$$"; db="pgf-db-$$"
trap 'docker rm -fv "$db" >/dev/null 2>&1; docker network rm "$net" >/dev/null 2>&1' EXIT
docker network create "$net" >/dev/null
docker run -d --name "$db" --network "$net" --network-alias postgres \
  -e POSTGRES_USER=relay -e POSTGRES_PASSWORD=test -e POSTGRES_DB=relay_test postgres:16-alpine >/dev/null
for _ in $(seq 40); do docker exec "$db" pg_isready -h 127.0.0.1 -U relay -d relay_test >/dev/null 2>&1 && break; sleep 0.5; done
sleep 1
timeout 120 docker run --rm --network "$net" -e TZ=Asia/Nicosia -e DATABASE_URL=postgres://relay:test@postgres:5432/relay_test \
  -v "$here":/p -w /p denoland/deno:alpine-2.1.4 run --allow-all facts.ts 2>/dev/null
