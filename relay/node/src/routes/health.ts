import { config } from "../config.ts";
import { json } from "../lib/http.ts";
import { storageEnabled } from "../lib/storage.ts";
import { enabled as databaseEnabled, query } from "../lib/db.ts";

// Two routes, and the difference between them is the point.
//
// `/health` is liveness: the process is up and answering. It always returns 200,
// because that is what the balancer's health check reads and a node that answers
// is a node that can serve cached pages and say what build it is.
//
// `/ready` is readiness: the node can do its work — the database answers. It
// returns 503 when it cannot, so a balancer can steer away from a box whose
// Postgres died while its process kept cheerfully answering ok. Until
// 2026-09-08 there was only the first, and its `status: "ok"` was a constant:
// it asked nothing, and the `storage` field was read from configuration rather
// than from the storage. A review panel called it the worst kind of green —
// the runbook's case "answers, but no work is getting done" had no signal at
// all, and traffic kept arriving.
const PROBE_TIMEOUT_MS = 1000;

// How long a probe result is reused. The balancer polls /health from many
// points of presence, and the pool holds four connections (lib/db.ts): a probe
// per request turns anonymous HTTP into database connections one for one, and a
// timed-out probe does NOT release its connection — `withTimeout` bounds the
// answer, not the query. So a hung Postgres plus a busy balancer emptied the
// pool and took the panel, the queue and the worker down with it. Found by a
// review panel on 2026-09-08, hours after the probe was added.
const PROBE_CACHE_MS = 5000;

// A probe that hangs is a probe that turns a health check into a timeout, and
// the balancer reads a timeout as "dead" — for a node that may be perfectly
// able to serve. One second, then say what is known.
async function withTimeout<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer = 0;
  const guard = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, guard]);
  } finally {
    clearTimeout(timer);
  }
}

export type ProbeResult = "ok" | "down" | "off";

// `off` is not a failure: a node configured without a database is a node that
// was meant to run without one, and calling that "down" would make the field
// useless on exactly the deployments where it is normal.
let cached: { at: number; result: ProbeResult } | null = null;
let inFlight: Promise<ProbeResult> | null = null;

async function probeDatabase(): Promise<ProbeResult> {
  if (!databaseEnabled()) return "off";

  const now = Date.now();
  if (cached && now - cached.at < PROBE_CACHE_MS) return cached.result;

  // One probe at a time, whatever the traffic. Without this, every request that
  // arrives during a slow probe starts another — which is the pool exhaustion
  // this cache exists to prevent, only faster.
  if (inFlight) return await inFlight;

  inFlight = (async () => {
    const rows = await withTimeout(query<{ one: number }>("SELECT 1 AS one"), null);
    const result: ProbeResult = rows && rows.length > 0 ? "ok" : "down";
    cached = { at: Date.now(), result };
    return result;
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

// Tests need a clean slate: a cached "ok" from one case would answer for the
// next, and a probe that never runs proves nothing.
export function forgetProbe(): void {
  cached = null;
  inFlight = null;
}

export async function health(): Promise<Response> {
  const database = await probeDatabase();
  return json({
    // Liveness stays unconditional: this route is the balancer's, and taking a
    // box out of rotation is /ready's decision, not this one's.
    status: "ok",
    node: config.nodeId,
    region: config.region,
    env: config.envName,
    // What a deploy asks about afterwards: not "does a node answer" but "is it
    // this build". Reported here rather than on a route of its own because the
    // balancer already polls this one and it costs nothing to add.
    image: config.imageTag,
    storage: storageEnabled(),
    storage_transport: config.storage.transport,
    mail: config.mail.transport,
    brands: config.brands.map((b) => b.key),
    // Asked, not assumed. `storage` above says what this node was configured
    // with; `database` says what answered a moment ago.
    database,
    ts: new Date().toISOString(),
  });
}

export async function ready(): Promise<Response> {
  const database = await probeDatabase();
  const ok = database !== "down";
  return json({
    status: ok ? "ready" : "not_ready",
    node: config.nodeId,
    env: config.envName,
    database,
    ts: new Date().toISOString(),
  }, ok ? 200 : 503);
}
