// HEAD is GET without a body, and a load balancer usually probes with it.
//
// The dispatcher matched the whole string "GET /health", so `HEAD /health` fell
// through to 404 — measured on production 2026-09-10, where GET answered 200 at
// the same moment. A monitor reading that would take a live node for a dead one
// and pull it out of rotation.
//
// Until 2026-09-24 this case restated the dispatcher's rule in its own lines,
// so it stayed green whatever main.ts did. It now calls the dispatcher itself
// (src/dispatch.ts), the function main.ts serves.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({});

const count = (render: () => string, series: string) => {
  const line = render().split("\n").find((l) => l.startsWith(`relay_requests_total{`) && l.includes(series));
  return line ? Number(line.split(" ").pop()) : 0;
};

configured("HEAD is answered by the GET handler through the dispatcher, with GET's headers and no body", async () => {
  const { dispatch } = await import("../src/dispatch.ts");
  const { render } = await import("../src/lib/metrics.ts");

  const get = await dispatch(new Request("http://relay.test/health"));
  const before = count(render, 'route="GET /health",status="200"');
  const head = await dispatch(new Request("http://relay.test/health", { method: "HEAD" }));
  assertEquals(head.status, 200, "HEAD /health did not find the GET handler");
  assertEquals(get.status, 200);
  assertEquals(head.headers.get("content-type"), get.headers.get("content-type"), "HEAD lost the headers GET sends");
  assert(head.headers.get("x-request-id"), "HEAD lost the node's own headers");
  assertEquals(await head.text(), "", "HEAD carried a body");
  assert((await get.text()).length > 0, "the GET it is compared with had no body to drop");
  assertEquals(count(render, 'route="GET /health",status="200"'), before + 1,
    "HEAD was not counted under the GET series");
  assert(!render().includes('route="HEAD '), "HEAD invented a series of its own");

  const unknown = await dispatch(new Request("http://relay.test/nope", { method: "HEAD" }));
  assertEquals(unknown.status, 404);
  assertEquals(await unknown.text(), "", "a 404 to HEAD carried a body");
  assert(render().includes('route="GET <unmatched>"'), "an unknown path under HEAD did not collapse to one series");
});
