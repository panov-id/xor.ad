// A label is part of a series name, and series never go away.
//
// Production proved both halves of this on 2026-09-10. A public scrape carried
// `POST /admin/dsa-notices/<uuid>/decide` — three real Article 16 notice ids,
// readable by anybody — because the label was built from the raw path. The same
// scrape carried a series per path a scanner had ever tried (`GET /.git/config`,
// `GET /xmlrpc.php`), because nothing put a ceiling on the map.
//
// Both are guarded here: the label is the route, and the map has a ceiling.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({});

configured("the method is normalised too, or the map grows from the other side", async () => {
  const { metricLabel } = await import("../src/lib/router.ts");

  assertEquals(
    metricLabel("GET", "/health", { exact: true }),
    "GET /health",
    "a known method on an exact route is itself",
  );
  assertEquals(
    metricLabel("POST", "/admin/dsa-notices/21b6ec3d-a8eb/decide", {
      pattern: "/admin/dsa-notices/:id/decide",
    }),
    "POST /admin/dsa-notices/:id/decide",
    "a patterned route is labelled by the pattern",
  );
  // Deno passes any token through as req.method — measured 2026-09-10: FOOBAR,
  // sixty X's and A|B all reach the handler with a 200.
  assertEquals(
    metricLabel("FOOBAR", "/nope"),
    "<other> <unmatched>",
    "an unknown method is one series, not a series per token a scanner invents",
  );
  assertEquals(
    metricLabel("A|B", "/nope"),
    "<other> <unmatched>",
    "including one carrying a separator",
  );
});

configured("a matched pattern labels by the pattern, not by the id", async () => {
  const { route, match } = await import("../src/lib/router.ts");
  route("POST", "/admin/dsa-notices/:id/decide", () => new Response("ok"));

  const hit = match("POST", "/admin/dsa-notices/21b6ec3d-a8eb-4070-813d-81c8f44164a7/decide");
  assert(hit, "the pattern still matches a real path");
  assertEquals(
    hit.pattern,
    "/admin/dsa-notices/:id/decide",
    "and what comes back for the label is the pattern — an id in a label is an id in a series name",
  );
  assert(
    !hit.pattern.includes("21b6ec3d"),
    "the id must not survive into the label",
  );
});

configured("a ceiling is per metric name, so a noisy one cannot silence a quiet one", async () => {
  const { inc, render } = await import("../src/lib/metrics.ts");

  // A signal that exists only when something is wrong — created BEFORE the flood,
  // the way it would be on a node that had already refused somebody.
  inc("relay_probe_signal_total", { result: "rate_limited" });

  // Now drown the map, the way a scanner would with an unbounded label.
  for (let i = 0; i < 1_200; i++) inc("relay_probe_noise_total", { path: `/scan-${i}` });

  // And a signal that appears only AFTER the flood: this is the one a shared
  // ceiling would have swallowed, and the one whose absence reads as "it never
  // happened" rather than as a flat line.
  inc("relay_probe_late_total", { result: "denied" });

  const body = render();
  const noise = body.split("\n").filter((l) => l.startsWith("relay_probe_noise_total{")).length;
  assert(
    noise <= 1_000,
    `the noisy metric is capped: ${noise} series published, ceiling is 1000`,
  );
  assert(
    body.includes('relay_probe_late_total{result="denied"} 1'),
    "a metric that first appears after the flood is still written — the ceiling is per name",
  );
  assert(
    body.includes('relay_probe_signal_total{result="rate_limited"} 1'),
    "and one that existed before it keeps counting",
  );
  assert(
    /relay_metrics_writes_dropped_total\{metric="relay_probe_noise_total"\} \d+/.test(body),
    "the refusal is published, and it names which metric overflowed",
  );
});

configured("label values are escaped, and non-numbers are written as the format wants", async () => {
  const { inc, setGauge, render } = await import("../src/lib/metrics.ts");

  inc("relay_probe_escape_total", { v: 'a"b\\c' });
  inc("relay_probe_escape_total", { v: "line1\nline2" });
  inc("relay_probe_escape_total", { v: "a|b" });
  setGauge("relay_probe_inf", 1 / 0);

  const body = render();
  assert(
    body.includes('relay_probe_escape_total{v="a\\"b\\\\c"} 1'),
    "a quote and a backslash are escaped — an unescaped quote ends the value early",
  );
  assert(
    body.includes('relay_probe_escape_total{v="line1\\nline2"} 1'),
    "a line feed is escaped — unescaped it splits the exposition in two and the whole scrape fails",
  );
  assert(
    body.includes('relay_probe_escape_total{v="a|b"} 1'),
    "and a value is not truncated at a separator: the key is JSON, not glued text",
  );
  assert(
    body.includes("relay_probe_inf +Inf"),
    "infinity is written +Inf, the way the format requires — `Infinity` no parser accepts",
  );
});

configured("a stored error line carries no address and no id", async () => {
  const { withoutAddresses } = await import("../src/lib/mailer.ts");
  const { metricLabel } = await import("../src/lib/router.ts");

  // What main.ts now puts into a line of level `error` — the level that lib/log.ts
  // copies to object storage and the panel reads back. Two things used to travel
  // there in the raw path: an address, from `/admin/panel-users/:email`, and a
  // notice id, from `/admin/dsa-notices/:id/decide`.
  const path = "/admin/panel-users/boss@alpha.test";
  assertEquals(
    withoutAddresses(path),
    "/admin/panel-users/<address>",
    "the address is scrubbed out of the path before it is stored",
  );
  assertEquals(
    metricLabel("PATCH", path, { pattern: "/admin/panel-users/:email" }),
    "PATCH /admin/panel-users/:email",
    "and the route the line is filed under is the pattern, carrying neither",
  );
  assert(
    !withoutAddresses(String(new Error("send failed for boss@alpha.test"))).includes("@alpha"),
    "an exception text is scrubbed the same way — it is what reaches the line",
  );
});
