#!/usr/bin/env python3
"""Reads a load run's output dir and prints, per step: requests; p50/p95/max by route on the NODE's own
milliseconds (its request log, joined to every client call by the x-request-id the node answered with)
next to the client-side milliseconds and their gap; errors by status and route; the first failures with
their messages and the node's log lines around them; CPU and memory peaks per container; the database's
connections and slow statements; the drivers' event-loop delay. Ends with the verdict: the largest
concurrency whose step (and every step before it) held p95 <= 2 s on the node side with 0 errors.

Files: bots-<k>.jsonl (bots.mjs, one per driver), node-<container>.log (observe.sh, docker logs
--timestamps), stats.jsonl, pg.jsonl, pg-notes.txt. Step 0 is the warm-up (registrations, cabinets): shown
once, never judged. The node's `ms` is its handler time; a wait before the handler (accept queue, a busy
event loop) is in the client's ms and not in the node's, so the gap column is the thing to read: with the
driver healthy (loop p99 <= 50 ms) a large gap is queueing at the node, with a lagging driver it is the
driver's. The client-side verdict is printed too, and disagreement between the two is said out loud.

    python3 -I scripts/load/analyze.py testing/load/<timestamp> [--p95-ms 2000]
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

LOOP_OK_MS = 50


def pct(xs, q):
    if not xs:
        return 0.0
    s = sorted(xs)
    return s[min(len(s) - 1, max(0, -int(-q * len(s) // 1) - 1))]


def jsonl(path):
    out = []
    for raw in path.read_text(errors="replace").splitlines():
        raw = raw.strip()
        if raw.startswith("{"):
            try:
                out.append(json.loads(raw))
            except ValueError:
                pass
    return out


def node_log(out):
    """req_id -> (ms, status, route); and the warn/error lines as (epoch ms, text)."""
    by_id, bad = {}, []
    from datetime import datetime
    for f in sorted(out.glob("node-*-node-1.log")):
        for raw in f.read_text(errors="replace").splitlines():
            m = re.match(r"(\S+Z) (\{.*\})\s*$", raw)
            if not m:
                continue
            try:
                d = json.loads(m.group(2))
            except ValueError:
                continue
            if d.get("msg") == "request" and d.get("req_id"):
                by_id[d["req_id"]] = (d.get("ms", 0), d.get("status"), d.get("route"))
            elif d.get("level") in ("warn", "error"):
                ts = m.group(1)[:26] + "Z"
                try:
                    t = datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ").timestamp() * 1000
                except ValueError:
                    t = 0
                bad.append((t + 0, f"{d.get('level')} {d.get('msg')} {str({k: v for k, v in d.items() if k not in ('ts', 'level', 'msg', 'node', 'env')})[:200]}"))
    return by_id, bad


def mb(text):
    m = re.match(r"([\d.]+)\s*([KMG]i?B)", text or "")
    if not m:
        return 0.0
    return float(m.group(1)) * {"KB": 1 / 1024, "KiB": 1 / 1024, "MB": 1, "MiB": 1, "GB": 1024, "GiB": 1024}[m.group(2)]


def main():
    limit = 2000.0
    argv = sys.argv[1:]
    if "--p95-ms" in argv:
        k = argv.index("--p95-ms")
        limit = float(argv[k + 1])
        del argv[k:k + 2]
    out = Path(argv[0])
    recs = [r for f in sorted(out.glob("bots-*.jsonl")) for r in jsonl(f)]
    reqs = [r for r in recs if r.get("kind") == "req"]
    steps_raw = [r for r in recs if r.get("kind") == "step"]
    stats = jsonl(out / "stats.jsonl") if (out / "stats.jsonl").exists() else []
    pg = jsonl(out / "pg.jsonl") if (out / "pg.jsonl").exists() else []
    host = jsonl(out / "host.jsonl") if (out / "host.jsonl").exists() else []
    notes = (out / "pg-notes.txt").read_text().strip() if (out / "pg-notes.txt").exists() else "pg-notes.txt missing"
    by_id, bad = node_log(out)
    if not reqs:
        print("no requests in bots-*.jsonl")
        return 1
    for r in reqs:
        n = by_id.get(r.get("rid")) if r.get("rid") else None
        r["node_ms"] = n[0] if n else None

    for n in (r for r in recs if r.get("kind") == "note"):
        print("note:", n["msg"])
    pubs = [r for r in recs if r.get("kind") == "publish"]
    if pubs:
        topics = Counter(p.get("topic") or "(corpus)" for p in pubs if p["status"] == 200)
        print(f"phrases published: {sum(topics.values())} of {len(pubs)} tries; by topic: " + ", ".join(f"{t} {n}" for t, n in topics.most_common()))
    offers = [r for r in recs if r.get("kind") == "offer"]
    if offers:
        c = Counter((o["brand"], o["status"]) for o in offers)
        print("offers published (brand, status): " + ", ".join(f"{b} {s} x{n}" for (b, s), n in sorted(c.items())))
    matched = sum(1 for r in reqs if r["node_ms"] is not None)
    timed_all = sum(1 for r in reqs if r["status"] > 0)
    print(f"joined to the node's own log: {matched} of {timed_all} calls (the rest: log lines not captured, or no answer)")

    warm = [r for r in reqs if r["step"] == 0]
    done = [r for r in recs if r.get("kind") == "run" and r.get("phase") == "warm-up-done"]
    if warm:
        print(f"WARM-UP (not judged): {len(warm)} calls, errors {sum(1 for r in warm if r.get('err'))}; "
              + ", ".join(f"driver {d['driver']}: {d['registered']}/{d['wanted']} registered in {d['seconds']} s, loop max {d['loop_lag_max_ms']} ms" for d in done))

    by_step = defaultdict(list)
    for r in reqs:
        if r["step"] > 0:
            by_step[r["step"]].append(r)
    verdict_node = verdict_client = None
    node_alive = client_alive = True
    for st in sorted(by_step):
        rs = by_step[st]
        metas = [s for s in steps_raw if s["step"] == st]
        conc = metas[0]["concurrency"] if metas else "?"
        cl = [r["ms"] for r in rs if r["status"] > 0]
        nd = [r["node_ms"] for r in rs if r["node_ms"] is not None]
        errs = [r for r in rs if r.get("err")]
        refused = [r for r in rs if r.get("soft")]
        lag = max((m.get("driver_loop_p99_ms", 0) for m in metas), default=0)
        lagmax = max((m.get("driver_loop_max_ms", 0) for m in metas), default=0)
        print(f"\n=== step {st}: {conc} bots, {len(rs)} requests, errors {len(errs)}, refused(404/409/422) {len(refused)} ===")
        print(f"    node-side  p50 {pct(nd, .5):.0f} / p95 {pct(nd, .95):.0f} / max {max(nd or [0]):.0f} ms    "
              f"client-side p50 {pct(cl, .5):.0f} / p95 {pct(cl, .95):.0f} / max {max(cl or [0]):.0f} ms")
        print(f"    driver event-loop delay: p99 of 2 s maxima {lag} ms, worst {lagmax} ms"
              + ("" if lag <= LOOP_OK_MS else f"   <-- DRIVER-BOUND (> {LOOP_OK_MS} ms): client-side numbers of this step are not the node's"))
        for m in metas:
            if m.get("stop"):
                print(f"    STOPPED (driver {m.get('driver', 0)}): {m['stop']}")
        routes = defaultdict(list)
        for r in rs:
            if r["status"] > 0:
                routes[r["route"]].append(r)
        print(f"    {'route':34} {'n':>5} | {'node p50':>8} {'p95':>6} {'max':>6} | {'client p50':>10} {'p95':>6} {'max':>6} | gap p95")
        for route, rr in sorted(routes.items(), key=lambda kv: -pct([x["node_ms"] for x in kv[1] if x["node_ms"] is not None], .95)):
            n_ = [x["node_ms"] for x in rr if x["node_ms"] is not None]
            c_ = [x["ms"] for x in rr]
            print(f"    {route:34} {len(rr):5d} | {pct(n_, .5):8.0f} {pct(n_, .95):6.0f} {max(n_ or [0]):6.0f} | {pct(c_, .5):10.0f} {pct(c_, .95):6.0f} {max(c_):6.0f} | {pct(c_, .95) - pct(n_, .95):7.0f}")
        if errs:
            c = Counter((r["status"], r["route"]) for r in errs)
            print("    errors by status/route: " + "; ".join(f"{s} {rt} x{n}" for (s, rt), n in c.most_common(8)))
            for r in sorted(errs, key=lambda r: r["t"])[:3]:
                print(f"    first failure: bot {r['bot']} {r['action']} {r['route']} -> {r['status']}: {str(r['err'])[:200]}")
                around = [txt for t, txt in bad if abs(t - r["t"]) < 3000][:4]
                for txt in around:
                    print(f"        node log: {txt}")
        if refused:
            c = Counter((r["status"], r["route"]) for r in refused)
            print("    refused: " + "; ".join(f"{s} {rt} x{n}" for (s, rt), n in c.most_common(6)))
        if metas:
            lo, hi = min(m["started"] for m in metas), max(m["ended"] for m in metas)
            peak = {}
            for s in stats:
                if lo <= s["t"] <= hi:
                    p = peak.setdefault(s["name"], [0.0, 0.0])
                    p[0] = max(p[0], float((s["cpu"] or "0").rstrip("%") or 0))
                    p[1] = max(p[1], mb(s["mem"].split("/")[0]))
            for name, (cpu, mem) in sorted(peak.items(), key=lambda kv: -kv[1][0])[:6]:
                print(f"    peak {name:36} cpu {cpu:6.1f} %  mem {mem:7.0f} MiB")
            if not peak:
                print("    (no docker stats samples in this step)")
            hw = [h for h in host if lo <= h["t"] <= hi]
            if hw:
                busy = max(h["load1"] for h in hw) > hw[0]["cores"]
                print(f"    host: load1 peak {max(h['load1'] for h in hw):.1f} on {hw[0]['cores']} cores, CPU pressure peak {max(h['cpu_psi10'] or 0 for h in hw):.0f} %, IO pressure peak {max(h['io_psi10'] or 0 for h in hw):.0f} %"
                      + ("   <-- HOST OVERLOADED: the stand shares the machine with other work; latencies include scheduling waits" if busy else ""))
            window = [p for p in pg if lo <= p["t"] <= hi]
            if window:
                slow = [q for p in window for q in (p.get("slow") or [])]
                print(f"    postgres: peak connections {max(p['total'] for p in window)}, peak active {max(p['active'] for p in window)},"
                      f" lock waits {max(p['waiting'] for p in window)}, slow samples (>200 ms) {len(slow)}")
                for q in sorted(slow, key=lambda q: -q["ms"])[:2]:
                    print(f"      {q['ms']} ms: {q['q']}")
            warns = [txt for t, txt in bad if lo <= t <= hi]
            if warns:
                print(f"    node warn/error log lines in this step: {len(warns)}; first: {warns[0][:200]}")
        stopped = any(m.get("stop") for m in metas)  # a step that tripped the stop rule did not hold
        node_ok = bool(nd) and pct(nd, .95) <= limit and not errs and not stopped
        client_ok = bool(cl) and pct(cl, .95) <= limit and not errs and not stopped
        node_alive = node_alive and node_ok
        client_alive = client_alive and client_ok
        if node_alive and isinstance(conc, int):
            verdict_node = conc
        if client_alive and isinstance(conc, int):
            verdict_client = conc
    print(f"\npostgres: {notes}\n")
    ends = [r for r in recs if r.get("kind") == "run" and r.get("phase") == "end" and r.get("stopped_early")]
    for e in ends:
        print(f"driver {e['driver']} stopped early: {e['reason']}")
    fmt = lambda v: "none" if v is None else f"{v} bots"
    print(f"VERDICT (node-side): max concurrency at p95 <= {limit / 1000:g} s with 0 errors = {fmt(verdict_node)}")
    print(f"client-side, for comparison: {fmt(verdict_client)}" + ("" if verdict_client == verdict_node else "   <-- differs: read the gap column and the driver lag above"))
    return 0


sys.exit(main())
