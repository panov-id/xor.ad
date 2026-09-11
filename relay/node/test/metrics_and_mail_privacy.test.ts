// Two things that were open because nobody had decided they should be.
//
// /metrics answered anybody on the node's public hostname — inherited from
// /health, where openness was argued, rather than chosen. It hands over the
// tenant names, the request volume per route and per brand, and the mail and
// quota counters.
//
// And a rejected send wrote the provider's whole reply into an error line.
// Resend quotes the request back when it complains, so a mistyped recipient put
// an email address into a log that storage keeps for thirty days.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { suite, useEnvironment } from "./support/config_env.ts";

const TOKEN = "metrics-token-for-the-test";

const scrape = async (headers: Record<string, string> = {}): Promise<Response> => {
  const { metrics } = await import("../src/routes/metrics.ts");
  return metrics(new Request("https://relay.test/metrics", { headers }));
};

// One suite name, because scripts/count-tests.sh counts `Deno.test`,
// `configured` and `stored` and nothing else — a case declared under a name of
// its own is a case nobody counts. The one test that needs a token states it
// itself.
const configured = suite({});

configured("with no token set, metrics are not served to anybody", async () => {
  const res = await scrape();
  assertEquals(res.status, 404, "closed is the default, and 404 does not confirm the path");
  const body = await res.text();
  assert(!body.includes("relay_requests_total"), "and no counters leak through the refusal");
});

configured("with a token set, only the holder reads them", async () => {
  useEnvironment({ METRICS_TOKEN: TOKEN });
  assertEquals((await scrape()).status, 404, "no token presented");
  assertEquals(
    (await scrape({ authorization: `Bearer wrong-${TOKEN}` })).status,
    404,
    "a wrong token is refused",
  );
  const ok = await scrape({ authorization: `Bearer ${TOKEN}` });
  assertEquals(ok.status, 200, "the holder gets the scrape");
  assert(
    (ok.headers.get("content-type") ?? "").includes("text/plain"),
    "in the format a scraper expects",
  );
});

// The mail side. `providerFault` and `withoutAddresses` are not exported — the
// module's surface is the send functions — so what is checked here is the
// property that matters and is checkable from outside: nothing this module
// writes to a log may carry an address.
configured("a rejected send names the fault, not the recipient", async () => {
  const source = await Deno.readTextFile(
    new URL("../src/lib/mailer.ts", import.meta.url),
  );
  // The provider's body reached the log through these two shapes, and both were
  // 500 characters of whatever it felt like quoting back.
  assert(
    !/res\.text\(\)/.test(source),
    "the provider's body must not be read into a message or a log line",
  );
  // Every exception that reaches a log line goes through the scrubber — and not
  // only in this file. The rule was pinned to mailer.ts alone, and two calls in
  // routes/admin.ts logged `String(error)` straight from a failed invitation
  // (found by a review lens, 2026-09-08).
  //
  // The sweep covers the modules that actually send mail, which is the honest
  // boundary: an exception carries a recipient only if it came back from the
  // provider, and only these files call it. Widening it to all of src/ was tried
  // and abandoned — it flagged fourteen places where the exception is a failed
  // query or a bad JSON body, and a rule that demands scrubbing there teaches
  // people to scrub everything and read nothing.
  const senders = [...walk(new URL("../src", import.meta.url))].filter((entry) =>
    Deno.readTextFileSync(entry).includes('from "../lib/mailer.ts"') ||
    Deno.readTextFileSync(entry).includes('from "./mailer.ts"')
  );
  assert(senders.length >= 3, `expected several mail-sending modules, found ${senders.length}`);
  const offenders: string[] = [];
  for (const entry of senders) {
    const text = await Deno.readTextFile(entry);
    for (const [, before] of text.matchAll(/(.{0,24})String\((?:e|error)\)/gs)) {
      if (!before.includes("withoutAddresses(")) offenders.push(entry.split("/src/")[1]);
    }
  }
  assertEquals(
    offenders.length,
    0,
    `an exception reaches a stored log line unscrubbed in: ${offenders.join(", ")}`,
  );
});

function* walk(dir: URL): Generator<string> {
  for (const entry of Deno.readDirSync(dir)) {
    const child = new URL(`${dir.pathname}/${entry.name}`, dir);
    if (entry.isDirectory) yield* walk(child);
    else if (entry.name.endsWith(".ts")) yield child.pathname;
  }
}

configured("the scrubber removes an address wherever it sits in a message", async () => {
  const { withoutAddresses } = await import("../src/lib/mailer.ts");
  assertEquals(
    withoutAddresses("panel mail rejected: 422 Invalid `to` field: boss@alpha.test"),
    "panel mail rejected: 422 Invalid `to` field: <address>",
  );
  assertEquals(
    withoutAddresses("a.b+c@sub.example.co and second@x.io both failed"),
    "<address> and <address> both failed",
  );
  assertEquals(withoutAddresses("nothing to remove here"), "nothing to remove here");
});
