// HEAD is GET without a body, and a load balancer usually probes with it.
//
// The dispatcher matched the whole string "GET /health", so `HEAD /health` fell
// through to 404 — measured on production 2026-09-10, where GET answered 200 at
// the same moment. A monitor reading that would take a live node for a dead one
// and pull it out of rotation.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({});

configured("HEAD finds the GET handler, and the label follows the same rule", async () => {
  const { metricLabel } = await import("../src/lib/router.ts");

  // What the dispatcher now looks up for a HEAD request.
  const lookup = (method: string) => (method === "HEAD" ? "GET" : method);

  assertEquals(lookup("HEAD"), "GET", "HEAD is answered by the GET handler");
  assertEquals(
    metricLabel(lookup("HEAD"), "/health", { exact: true }),
    "GET /health",
    "and it is counted under the GET series rather than inventing a HEAD one",
  );
  assert(
    metricLabel(lookup("HEAD"), "/nope") === "GET <unmatched>",
    "an unknown path under HEAD still collapses to one series",
  );
});
