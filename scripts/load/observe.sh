#!/usr/bin/env bash
# Watches the local stand while the bots run (scripts/load/run.sh starts it in the
# background): every 5 s, `docker stats --no-stream` of the xor-local-* containers
# into stats.jsonl, the nodes' new log lines into node-<container>.log, and the
# host load and pressure into host.jsonl, the database's view into pg.jsonl (connections by state, statements running longer
# than 200 ms). pg_stat_statements is used when the extension is installed;
# otherwise pg-notes.txt says so and only pg_stat_activity is sampled.
# Stops when OUT/observe.stop appears or on a signal.
#
#   scripts/load/observe.sh OUT_DIR [interval_seconds]
set -uo pipefail
out="${1:?usage: observe.sh OUT_DIR [interval]}"; every="${2:-5}"
mkdir -p "$out"
pg=xor-local-sosed-postgres-1
psqlq() { docker exec "$pg" psql -U relay relay_test -At -c "$1" 2>/dev/null; }
if [ "$(psqlq "select count(*) from pg_extension where extname='pg_stat_statements'")" = "1" ]; then
  echo "pg_stat_statements: installed; top statements sampled into pg.jsonl" > "$out/pg-notes.txt"; have_pss=1
else
  echo "pg_stat_statements: NOT available on $pg; only pg_stat_activity (connections, statements running > 200 ms) is sampled" > "$out/pg-notes.txt"; have_pss=0
fi
prev="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
while [ ! -e "$out/observe.stop" ]; do
  now_s="$(date +%s.%N)"; now_iso="$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)"
  names="$(docker ps --format '{{.Names}}' | grep '^xor-local-' || true)"
  if [ -n "$names" ]; then
    # shellcheck disable=SC2086
    docker stats --no-stream --format '{{json .}}' $names 2>/dev/null \
      | python3 -c 'import sys,json; t=float(sys.argv[1])
for l in sys.stdin:
    d=json.loads(l); print(json.dumps({"t":int(t*1000),"name":d["Name"],"cpu":d["CPUPerc"],"mem":d["MemUsage"],"memp":d["MemPerc"],"pids":d["PIDs"]}))' "$now_s" >> "$out/stats.jsonl"
    for n in $(grep -- '-node-1$\|moderator' <<<"$names"); do
      docker logs --timestamps --since "$prev" --until "$now_iso" "$n" >> "$out/node-$n.log" 2>&1
    done
  fi
  row="$(psqlq "select json_build_object('t',(extract(epoch from now())*1000)::bigint,'total',count(*),'active',count(*) filter (where state='active'),'idle_in_tx',count(*) filter (where state like 'idle in transaction%'),'waiting',count(*) filter (where wait_event_type='Lock'),'slow',coalesce(json_agg(json_build_object('ms',(extract(epoch from now()-query_start)*1000)::int,'q',left(query,160))) filter (where state='active' and now()-query_start > interval '200 ms' and pid<>pg_backend_pid()),'[]'::json)) from pg_stat_activity where datname='relay_test'")"
  [ -n "$row" ] && echo "$row" >> "$out/pg.jsonl"
  if [ "$have_pss" = 1 ]; then
    psqlq "select json_build_object('t',(extract(epoch from now())*1000)::bigint,'top',json_agg(x)) from (select calls,round(mean_exec_time::numeric,1) mean_ms,round(max_exec_time::numeric,1) max_ms,left(query,120) q from pg_stat_statements order by total_exec_time desc limit 5) x" >> "$out/pg-statements.jsonl"
  fi
  # the host itself: a stand on a loaded machine measures the machine (load average, CPU and IO pressure)
  python3 -c 'import json,os,sys,re
t=float(sys.argv[1]); psi=lambda f: float(re.search(r"some avg10=([\d.]+)", open(f).read()).group(1)) if os.path.exists(f) else None
print(json.dumps({"t":int(t*1000),"load1":os.getloadavg()[0],"cores":os.cpu_count(),"cpu_psi10":psi("/proc/pressure/cpu"),"io_psi10":psi("/proc/pressure/io")}))' "$now_s" >> "$out/host.jsonl"
  prev="$now_iso"
  sleep "$every"
done
# the last window: what the nodes logged since the previous sample, so the end of the run is joinable
for n in $(docker ps --format '{{.Names}}' | grep '^xor-local-' | grep -- '-node-1$\|moderator'); do
  docker logs --timestamps --since "$prev" "$n" >> "$out/node-$n.log" 2>&1
done
