// Edge node — identical Deno image on every VPS in the pool. v1 serves the
// landing backend (waitlist / client-error / welcome). The chat relay slot is
// stubbed (see chat/relay.ts) so the node is chat-ready without chat code.

import { assertConfig, config } from "./config.ts";
import { corsHeaders, handlePreflight } from "./lib/cors.ts";
import { json } from "./lib/http.ts";
import { log } from "./lib/log.ts";
import { inc } from "./lib/metrics.ts";
import { health, ready } from "./routes/health.ts";
import { metrics } from "./routes/metrics.ts";
import { waitlist } from "./routes/waitlist.ts";
import { clientError } from "./routes/client_error.ts";
import { pageview } from "./routes/pageview.ts";
import { report } from "./routes/report.ts";
import { cspReport } from "./routes/csp_report.ts";
import { rememberRemote } from "./lib/client_ip.ts";
// Registers its own routes on import, like the admin module does.
import "./routes/dsa.ts";
import { closeAllRooms, relayUpgrade } from "./chat/relay.ts";
import { match, metricLabel } from "./lib/router.ts";
import { withoutAddresses } from "./lib/mailer.ts";
import { startWorker } from "./lib/jobs.ts";
import { armScheduledJobs, registerScheduledJobs } from "./lib/scheduled.ts";
import "./routes/admin.ts"; // registers /auth/* + /admin/* on the pattern router
import "./routes/v1.ts"; // registers the public /v1/* API on the same router
import "./routes/identity.ts"; // registers the identity routes of chat spec §13 step 1
import "./routes/transfer.ts"; // and the transfer of an identity between devices (§8.2)
import "./routes/feed.ts"; // step 2 of the build order: publishing a phrase (§8.3)
import "./routes/statements.ts"; // and Article 17 for an author with no mailbox (§13)
import "./routes/likes.ts"; // step 3: a like, and the match a mutual one makes (§8.4, §8.5)
import "./routes/matches.ts"; // step 4: consent to a match, and "not now" (§8.5)
import "./routes/chats.ts"; // step 5: a chat message through the node, and its receipt (§8.8)
import "./routes/blocks.ts"; // step 7: blocks (§8.9)
import "./routes/hidden.ts"; // and hiding a phrase for oneself
import "./routes/feed_queue.ts"; // the moderator's queue of the feed, in the panel (§8.3)
import "./routes/profile.ts"; // PATCH /identities/me: the profile edited, the name queued (§8.2)
import "./routes/inbox.ts"; // offers to talk and conversations in one answer (§8.12)

type Handler = (req: Request) => Response | Promise<Response>;

const routes: Record<string, Handler> = {
  "GET /health": () => health(),
  "GET /ready": () => ready(),
  "GET /metrics": (req) => metrics(req),
  "POST /waitlist": (req) => waitlist(req),
  "POST /client-error": (req) => clientError(req),
  "POST /pageview": (req) => pageview(req),
  // Article 16 DSA: a notice that something here is illegal. Public and
  // unauthenticated by design — an authority or a stranger must be able to
  // reach it without an account.
  "POST /report": (req) => report(req),
  // Where a browser says the content policy blocked something. Public and
  // unauthenticated by necessity: a violation report carries none of our
  // headers, and a report that needed a key would be silenced by exactly the
  // kind of policy error it exists to describe.
  "POST /csp-report": (req) => cspReport(req),
  "GET /chat": (req) => relayUpgrade(req), // the chat room: a ticket, then frames (protocol §4.4)
};

assertConfig();

// Background work, if there is a database to hold it. Both calls are no-ops
// without one, so a stand with no Postgres behaves exactly as it did.
registerScheduledJobs();
startWorker();
armScheduledJobs().catch((error) =>
  log("error", "could not arm the scheduled jobs", { error: String(error) })
);

// A stop is announced to every open room first: 1001, so the terminals come
// back on their own. The signal then ends the process as it would have.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  try {
    Deno.addSignalListener(signal, () => {
      const closed = closeAllRooms();
      log("info", "stopping: rooms closed with 1001", { signal, closed });
      Deno.exit(0);
    });
  } catch {
    // Not every platform has every signal; the server still runs.
  }
}

Deno.serve({ port: config.port, hostname: "0.0.0.0" }, async (req, info) => {
  // The only place the connection's own address is known.
  rememberRemote(req, info?.remoteAddr?.hostname);
  const url = new URL(req.url);
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return handlePreflight(origin);

  // HEAD is GET without a body, not a route of its own (RFC 9110 §9.3.2). The
  // dispatcher matched the whole string "GET /health", so `HEAD /health` fell
  // through to 404 — and a load balancer probing with HEAD, which is the common
  // default, would have read a live node as dead. Measured on production
  // 2026-09-10: HEAD /health answered 404 while GET answered 200.
  const isHead = req.method === "HEAD";
  const lookupMethod = isHead ? "GET" : req.method;
  const route = `${lookupMethod} ${url.pathname}`;
  const reqId = crypto.randomUUID();
  const started = performance.now();
  const handler: Handler | undefined = routes[route];
  const patterned = handler === undefined ? match(lookupMethod, url.pathname) : undefined;
  // Both halves of the label are normalised — the path by the pattern, the method
  // by a known set. The rule itself lives in lib/router.ts, where a probe can call
  // it without starting a server.
  const metricRoute = metricLabel(lookupMethod, url.pathname, {
    exact: handler !== undefined,
    pattern: patterned?.pattern,
  });
  let res: Response;
  try {
    if (typeof handler === "function") {
      res = await handler(req);
    } else if (patterned) {
      res = await patterned.h({ req, params: patterned.params, url });
    } else {
      res = json({ error: "not found" }, 404);
    }
  } catch (e) {
    // The stored line carries the ROUTE, not the raw path. `error` is copied to
    // object storage (lib/log.ts) and read from the panel, and among the patterns
    // is `/admin/panel-users/:email` — so a raw path put somebody's address into a
    // log kept for a year. The path is still there for the person debugging, with
    // addresses scrubbed by the same function the mail side uses.
    log("error", "handler threw", {
      route: metricRoute,
      path: withoutAddresses(url.pathname),
      req_id: reqId,
      error: withoutAddresses(String(e)),
    });
    res = json({ error: "internal" }, 500);
  }

  // Don't log/count the scrape endpoint itself (avoids self-referential noise).
  if (url.pathname !== "/metrics") {
    const ms = Math.round(performance.now() - started);
    // The label is the ROUTE, not the path: an id in a label becomes part of a
    // series name, and series never go away. An unknown path collapses to one
    // series per method — otherwise any scanner grows the map without a ceiling.
    inc("relay_requests_total", { route: metricRoute, status: String(res.status) });
    log("info", "request", { route, status: res.status, ms, req_id: reqId });
  }

  // A WebSocket upgrade (101) is handed back untouched: its headers are
  // immutable, and setting one threw and broke the upgrade — found by the depth
  // core's socket test on 2026-09-21, the first request of its kind here.
  if (res.status === 101) return res;
  res.headers.set("x-request-id", reqId);
  for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  // The body is dropped, the headers are kept: RFC 9110 asks a HEAD response to
  // carry the same header fields a GET would. Dropping the headers too would
  // make HEAD answer "alive" while saying nothing about what is alive.
  if (isHead) return new Response(null, { status: res.status, headers: res.headers });
  return res;
});

log("info", "listening", { port: config.port, region: config.region });
