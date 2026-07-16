import { render } from "../lib/metrics.ts";

// Prometheus scrape endpoint.
export function metrics(): Response {
  return new Response(render(), {
    headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" },
  });
}
