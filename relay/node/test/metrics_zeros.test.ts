// Every counter an alert rule reads is on /metrics at zero before its first
// event (B42, 2026-09-26). A series born at 1 is invisible to rate(): the one
// refused letter or the one 503 after a start never paged anybody, and an open
// DSA queue on a node with no decision yet never looked stuck (B40 findings).
//
// The selectors are read out of relay/local/observability/alerts.yml, so a new
// rule over a new counter is held to this without an edit here. The modules are
// loaded the way main.ts loads them — dispatch.ts and scheduled.ts — so what is
// checked is what a started node publishes, not what a test arranged.
import { assert } from "jsr:@std/assert@1";
import { suite } from "./support/config_env.ts";

const configured = suite({ MAIL_TRANSPORT: "resend", RESEND_API_KEY: "test-key" });

// The snapshot is taken while this module is evaluated: the unit run loads every
// test file into one process before any test runs, and the others' tests count
// real events into these same counters — read later, a zero was a one. Module
// evaluation is where a started node stands before its first request.
await import("../src/dispatch.ts");
await import("../src/lib/scheduled.ts");
const atStart = (await import("../src/lib/metrics.ts")).render();

// Counters whose labels cannot be listed in advance, each with the reason.
const EXEMPT: Record<string, string> = {
  relay_requests_total: "labelled by route and status: every 5xx of every route cannot be published ahead; ServerErrors fires at six a minute, so one missed first error does not change it",
};

type Matcher = { label: string; op: "=" | "!=" | "=~" | "!~"; value: string };

function selectors(rules: string): { rule: string; metric: string; matchers: Matcher[] }[] {
  const out: { rule: string; metric: string; matchers: Matcher[] }[] = [];
  const re = /- alert: (\w+)\s*\n(?:\s*#[^\n]*\n)*\s*expr: (?:>-\s*\n)?((?:.*\n)+?)\s*for:/g;
  for (const [, rule, expr] of rules.matchAll(re)) {
    for (const [, metric, body] of expr.matchAll(/(relay_\w+_total)(?:\{([^}]*)\})?/g)) {
      const matchers = [...(body ?? "").matchAll(/(\w+)\s*(=~|!~|!=|=)\s*"([^"]*)"/g)]
        .map(([, label, op, value]) => ({ label, op: op as Matcher["op"], value }));
      out.push({ rule, metric, matchers });
    }
  }
  return out;
}

function series(rendered: string): { metric: string; labels: Record<string, string>; value: number }[] {
  return rendered.split("\n").filter((l) => l && !l.startsWith("#")).map((line) => {
    const m = line.match(/^(\w+)(?:\{(.*)\})? (\S+)$/)!;
    const labels = Object.fromEntries([...(m[2] ?? "").matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
    return { metric: m[1], labels, value: Number(m[3]) };
  });
}

const holds = (m: Matcher, value: string | undefined) => {
  const v = value ?? "";
  if (m.op === "=") return v === m.value;
  if (m.op === "!=") return v !== m.value;
  const whole = new RegExp(`^(?:${m.value})$`).test(v);
  return m.op === "=~" ? whole : !whole;
};

configured("every counter an alert reads is published at zero before its first event", async () => {
  const rules = await Deno.readTextFile(new URL("../../local/observability/alerts.yml", import.meta.url));
  const found = selectors(rules);
  assert(found.length >= 10, `only ${found.length} counter selectors read from alerts.yml — the parse is broken`);
  const published = series(atStart);
  const missing: string[] = [];
  for (const { rule, metric, matchers } of found) {
    if (EXEMPT[metric]) continue;
    const shown = matchers.map((m) => `${m.label}${m.op}"${m.value}"`).join(",");
    const hit = published.some((s) => s.metric === metric && s.value === 0 && matchers.every((m) => holds(m, s.labels[m.label])));
    if (!hit) missing.push(`${rule}: ${metric}{${shown}}`);
  }
  assert(missing.length === 0, `counters an alert reads with no series at zero before the first event:\n  ${missing.join("\n  ")}`);
});
