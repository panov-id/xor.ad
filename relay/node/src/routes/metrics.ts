import { render } from "../lib/metrics.ts";
import { config } from "../config.ts";
import { json } from "../lib/http.ts";

// Prometheus scrape endpoint, behind a shared token.
//
// It used to be open on the node's public hostname. That was inherited from
// /health rather than decided: /health says one word about whether the node can
// work, while this hands over the tenant names, the request volume per route and
// per brand, and the mail and quota counters — a competitor's traffic, readable
// by anyone who guesses the path.
//
// Not filtered by address, because there is no address to filter on: every
// request reaches this process through the proxy beside it, so the connection's
// address is the same for a scraper on the box and for the whole internet
// (lib/client_ip.ts says the same thing about the rate limiter).
//
// With no token set the endpoint is 404 for everybody. Nothing scrapes it today,
// so closed is the honest default — and 404 rather than 401, because a 401 tells
// a guesser the path was right.
export function metrics(req: Request): Response {
  const expected = config.metricsToken;
  if (!expected) return json({ error: "not found" }, 404);
  const presented = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ??
    req.headers.get("x-metrics-token")?.trim() ?? "";
  if (!safeEqual(presented, expected)) return json({ error: "not found" }, 404);
  return new Response(render(), {
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}

// Comparing with === leaks the length of the shared prefix through timing. The
// token is long and random, so the leak is unlikely to be exploitable — but the
// fix costs four lines and does not need the argument.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let differing = 0;
  for (let i = 0; i < a.length; i++) differing |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return differing === 0;
}
