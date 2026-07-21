// Edge node — identical Deno image on every VPS in the pool. v1 serves the
// landing backend (waitlist / client-error / welcome). The chat relay slot is
// stubbed (see chat/relay.ts) so the node is chat-ready without chat code.

import { assertConfig, config } from "./config.ts";
import { corsHeaders, handlePreflight } from "./lib/cors.ts";
import { json } from "./lib/http.ts";
import { log } from "./lib/log.ts";
import { inc } from "./lib/metrics.ts";
import { health } from "./routes/health.ts";
import { metrics } from "./routes/metrics.ts";
import { waitlist } from "./routes/waitlist.ts";
import { clientError } from "./routes/client_error.ts";
import { relayUpgrade } from "./chat/relay.ts";
import { match } from "./lib/router.ts";
import "./routes/admin.ts"; // registers /auth/* + /admin/* on the pattern router

type Handler = (req: Request) => Response | Promise<Response>;

const routes: Record<string, Handler> = {
  "GET /health": () => health(),
  "GET /metrics": () => metrics(),
  "POST /waitlist": (req) => waitlist(req),
  "POST /client-error": (req) => clientError(req),
  "GET /chat": (req) => relayUpgrade(req), // placeholder, returns 501
};

assertConfig();

Deno.serve({ port: config.port, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return handlePreflight(origin);

  const route = `${req.method} ${url.pathname}`;
  const reqId = crypto.randomUUID();
  const started = performance.now();
  const handler: Handler | undefined = routes[route];
  const patterned = handler === undefined ? match(req.method, url.pathname) : undefined;
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
    log("error", "handler threw", { route, req_id: reqId, error: String(e) });
    res = json({ error: "internal" }, 500);
  }

  // Don't log/count the scrape endpoint itself (avoids self-referential noise).
  if (url.pathname !== "/metrics") {
    const ms = Math.round(performance.now() - started);
    inc("relay_requests_total", { route, status: String(res.status) });
    log("info", "request", { route, status: res.status, ms, req_id: reqId });
  }

  res.headers.set("x-request-id", reqId);
  for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  return res;
});

log("info", "listening", { port: config.port, region: config.region });
