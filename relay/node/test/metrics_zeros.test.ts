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

// The zero has to be the series the count then lands on (review panel H5, B53,
// 2026-09-26). The check above asks only that some zero matches the selector,
// so the welcome letter counted under {transport, result} while the seed was
// {transport, result, kind} — a series of its own, born at 1, which the check
// passed and MailFailing never saw (H4). Every inc() of a counter an alert
// reads is read out of src/: its label names must be a seeded zero's label
// names, and where its literal values fall under a rule's selector, that very
// series must be at zero. Boundary: a value computed at run time — the PIN
// doors' `result === "wrong_pin" ? "wrong" : result` in identity.ts — is held
// by its label names only; which value it takes is the routes' own tests'
// (the tenth miss counted wrong, H6).
type Site = { at: string; metric: string; labels: Map<string, string | null> | null };

async function sites(): Promise<Site[]> {
  const out: Site[] = [];
  const walk = async (dir: URL, rel: string) => {
    for await (const e of Deno.readDir(dir)) {
      if (e.isDirectory) await walk(new URL(`${e.name}/`, dir), `${rel}${e.name}/`);
      if (!e.isFile || !e.name.endsWith(".ts")) continue;
      const source = await Deno.readTextFile(new URL(e.name, dir));
      for (const m of source.matchAll(/\binc\(\s*"(relay_\w+_total)"\s*(?:,\s*(\{[^}]*\}|[^,)\s][^,)]*))?/g)) {
        const at = `src/${rel}${e.name}:${source.slice(0, m.index).split("\n").length}`;
        const arg = m[2];
        if (arg !== undefined && !arg.startsWith("{")) {
          out.push({ at, metric: m[1], labels: null });
          continue;
        }
        const labels = new Map<string, string | null>();
        for (const part of (arg ?? "{}").slice(1, -1).split(",").map((p) => p.trim()).filter(Boolean)) {
          const [, key, value] = part.match(/^(\w+)\s*(?::\s*([\s\S]*))?$/) ?? [];
          if (key) labels.set(key, value?.match(/^"([^"]*)"$/)?.[1] ?? null);
          else labels.set(part, null);
        }
        out.push({ at, metric: m[1], labels });
      }
    }
  };
  await walk(new URL("../src/", import.meta.url), "");
  return out;
}

const keysOf = (names: Iterable<string>) => [...names].sort().join(",");

configured("every place a counter an alert reads grows lands on a series seeded at zero", async () => {
  const rules = await Deno.readTextFile(new URL("../../local/observability/alerts.yml", import.meta.url));
  const found = selectors(rules);
  const read = new Set(found.map((s) => s.metric).filter((m) => !EXEMPT[m]));
  const counted = (await sites()).filter((s) => read.has(s.metric));
  assert(counted.length >= 20, `only ${counted.length} counting places found in src/ — the parse is broken`);
  const zeros = series(atStart).filter((s) => s.value === 0);
  const wrong: string[] = [];
  for (const { at, metric, labels } of counted) {
    if (labels === null) {
      wrong.push(`${at}: ${metric} counted with labels not spelled out — the seed cannot be checked against them`);
      continue;
    }
    const shape = zeros.filter((z) => z.metric === metric && keysOf(Object.keys(z.labels)) === keysOf(labels.keys()));
    const shown = [...labels].map(([k, v]) => (v === null ? k : `${k}="${v}"`)).join(",");
    if (shape.length === 0) {
      wrong.push(`${at}: ${metric}{${shown}} — no series at zero with the labels {${keysOf(labels.keys())}}`);
      continue;
    }
    // Where the literal values alone put this series under a rule's selector,
    // that series itself must be at zero; a variable value is held by the names.
    const read = found.some((s) =>
      s.metric === metric && s.matchers.every((m) => {
        const v = labels.get(m.label);
        return v !== undefined && v !== null && holds(m, v);
      })
    );
    if (!read) continue;
    const exact = shape.some((z) => [...labels].every(([k, v]) => v === null || z.labels[k] === v));
    if (!exact) wrong.push(`${at}: ${metric}{${shown}} — an alert reads this series and it is not seeded at zero`);
  }
  assert(wrong.length === 0, `counted where the seed is not:\n  ${wrong.join("\n  ")}`);
});
