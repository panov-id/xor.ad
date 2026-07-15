// Edge node — identical Deno image on every VPS in the pool. v1 serves the
// landing backend (waitlist / client-error / welcome). The chat relay slot is
// stubbed (see chat/relay.ts) so the node is chat-ready without chat code.

import { assertConfig, config } from "./config.ts";
import { corsHeaders, handlePreflight } from "./lib/cors.ts";
import { json } from "./lib/http.ts";
import { health } from "./routes/health.ts";
import { waitlist } from "./routes/waitlist.ts";
import { clientError } from "./routes/client_error.ts";
import { relayUpgrade } from "./chat/relay.ts";

type Handler = (req: Request) => Response | Promise<Response>;

const routes: Record<string, Handler> = {
  "GET /health": () => health(),
  "POST /waitlist": (req) => waitlist(req),
  "POST /client-error": (req) => clientError(req),
  "GET /chat": (req) => relayUpgrade(req), // placeholder, returns 501
};

assertConfig();

Deno.serve({ port: config.port, hostname: "0.0.0.0" }, async (req) => {
  const url = new URL(req.url);
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return handlePreflight(origin);

  const handler = routes[`${req.method} ${url.pathname}`];
  let res: Response;
  if (handler) {
    try {
      res = await handler(req);
    } catch (e) {
      console.error(`${req.method} ${url.pathname}`, e);
      res = json({ error: "internal" }, 500);
    }
  } else {
    res = json({ error: "not found" }, 404);
  }

  for (const [k, v] of Object.entries(corsHeaders(origin))) res.headers.set(k, v);
  return res;
});

console.log(`[node ${config.nodeId}/${config.region}/${config.envName}] listening :${config.port}`);
