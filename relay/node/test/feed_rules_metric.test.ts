// relay_feed_rules_total has two shapes of series and no third (W12-FM,
// open.tsv feed.rules.metric): {result="published"}, and {result="queued",
// reason=<one of the rules>} — what routes/feed.ts increments. Until now a
// bare {result="queued"} was registered at zero and never counted, while the
// series with a reason, the ones a dashboard would read, were born at 1 and
// hid their first phrase from rate() (B42). Every series feed.ts can increment
// is on /metrics at zero from the start, and the dead one is gone.
//
// The snapshot is taken while this module is evaluated, as metrics_zeros does:
// the unit run loads every test file into one process, and another file's
// cases count real phrases into these counters.
import { assert, assertEquals } from "jsr:@std/assert@1";

const { RULE_REASONS, readText } = await import("../src/lib/feed_verdict.ts");
const atStart = (await import("../src/lib/metrics.ts")).render();

const line = (labels: string) => atStart.split("\n").find((l) => l.startsWith(`relay_feed_rules_total{${labels}}`));

Deno.test("every reason the rules can give has its queued series at zero from the start", () => {
  assert(RULE_REASONS.length >= 5, `the list of reasons is short: ${RULE_REASONS.join(",")}`);
  for (const reason of RULE_REASONS) {
    const found = line(`reason="${reason}",result="queued"`);
    assert(found, `no series for reason=${reason} before the first phrase`);
    assertEquals(found.split(" ").pop(), "0", `reason=${reason} is not at zero: ${found}`);
  }
  const published = line('result="published"');
  assert(published && published.endsWith(" 0"), `the rules' publication series is not at zero: ${published}`);
});

Deno.test("the bare queued series nothing increments is not published", () => {
  assertEquals(line('result="queued"'), undefined, "a {result=queued} series without a reason is on /metrics and will stay at zero for good");
});

Deno.test("what the text rules flag is in the list the series are registered from", () => {
  const seen = new Set<(typeof RULE_REASONS)[number]>();
  for (const text of ["смотри https://example.org", "пиши на kto@example.org", "+7 921 123 45 67", "@someone в телеграме"]) {
    for (const reason of readText(text)) seen.add(reason);
  }
  assert(seen.has("link") && seen.has("contact"), `the samples did not reach the text rules: ${[...seen].join(",")}`);
  for (const reason of seen) assert(RULE_REASONS.includes(reason), `reason=${reason} is flagged but has no series registered`);
});
