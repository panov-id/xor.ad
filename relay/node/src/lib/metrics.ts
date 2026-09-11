// Tiny in-memory Prometheus metrics. Exposed at GET /metrics for scraping.
//
// Two kinds, because two questions are different. A counter answers "how many
// since the process started" and only grows; a gauge answers "what is it right
// now" and moves both ways. Depth of a queue, age of the oldest unchecked
// phrase, number of open sockets — all of those are gauges, and until
// 2026-09-02 this module could not express them at all: everything was a
// counter, so the only way to publish a level was to lie about its type and
// let the scraper compute rates over a number that goes down.
//
// Both live in the process. A restart resets them, which is why the process
// start time is published as a gauge of its own: a counter that fell to zero
// and a counter that was always zero look identical, and the difference is
// exactly what someone woken at three in the morning is trying to establish.

// A ceiling on how many series live here, for the same reason `lib/rate_limit.ts`
// has MAX_TRACKED: the map is fed by request traffic, and traffic includes
// scanners. Production on 2026-09-10 already carried a series per probed path —
// `GET /.git/config`, `GET /xmlrpc.php`, hundreds of them — and nothing dropped
// them until a restart. Labels are normalised at the call site (main.ts collapses
// an unmatched path to one series per method), so reaching this ceiling means a
// new caller is labelling by something unbounded; the counter below says so out
// loud rather than letting the process grow quietly.
// Per metric NAME, not per map. A ceiling on the whole map lets one noisy metric
// evict everything else — and what gets refused is always a series that does not
// exist yet, which is exactly what a signal of trouble looks like:
// `relay_v1_total{result="rate_limited"}` is absent on a healthy node and appears
// the moment something goes wrong. With a shared ceiling, 10 000 junk series
// would mean that counter never gets created, and an attack reads as "never
// happened" rather than as a flat line.
const MAX_SERIES_PER_NAME = 1_000;

// There is no eviction, and that is a deliberate difference from `rate_limit.ts`,
// which does evict. There, whoever fills the map would otherwise decide when
// every counter resets — the map is fed by attacker-chosen keys. Here every label
// is either a literal, a value from configuration, or one of the two normalised
// halves of a route: the widest metric, `relay_requests_total`, tops out around
// 8 methods x 44 routes x the statuses that actually occur. Reaching a thousand
// series under one name therefore means new code added an unbounded label, and a
// silent eviction would hide exactly that. The refusal is published instead.

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

// How many WRITES were refused, by metric name — not how many series were lost.
// The two differ, and by a lot: one hot refused series adds one per request. The
// name says so, because at three in the morning `series_dropped` would be read as
// a count of series and the number would not fit that reading.
//
// Published like any other counter, and it is the signal that a label needs
// normalising — the metric name says which label to look at.
const dropped = new Map<string, number>();

// Series count per name, kept alongside the maps rather than recomputed: the
// maps are keyed by name+labels, and counting by prefix on every write would
// walk the whole map.
const seriesPerName = new Map<string, number>();

function roomFor(source: Map<string, number>, name: string, key: string): boolean {
  if (source.has(key)) return true;
  const count = seriesPerName.get(name) ?? 0;
  if (count >= MAX_SERIES_PER_NAME) {
    dropped.set(name, (dropped.get(name) ?? 0) + 1);
    return false;
  }
  seriesPerName.set(name, count + 1);
  return true;
}

// The key is JSON, not a string glued with separators. It used to be
// `name|k=v,k=v`, and a value containing one of those separators tore the key
// apart on the way back: `{brand: "a|b"}` rendered as `brand="a"`, and
// `{brand: 'x",y="z'}` rendered as two labels. Worse than the mangled output was
// what it meant — two different values collapsing into one series, silently.
// JSON has exactly one way to write each of those characters, and `JSON.parse`
// gives them back unchanged.
function keyOf(name: string, labels: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(labels).sort()) sorted[k] = labels[k];
  return JSON.stringify([name, sorted]);
}

function partsOf(key: string): [string, Record<string, string>] {
  return JSON.parse(key) as [string, Record<string, string>];
}

// Prometheus text format, "Text format details": a backslash, a double quote and
// a line feed in a label value have to be escaped. Without this a quote ends the
// value early and a line feed splits the exposition in two — a scrape then fails
// whole, not by one series.
function escapeLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

// The same format allows only Go's ParseFloat plus `NaN`, `+Inf` and `-Inf`.
// JavaScript writes the last two as `Infinity`, which no parser accepts.
function formatValue(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "+Inf";
  if (value === -Infinity) return "-Inf";
  return String(value);
}

export function inc(name: string, labels: Record<string, string> = {}, by = 1): void {
  const k = keyOf(name, labels);
  if (!roomFor(counters, name, k)) return;
  counters.set(k, (counters.get(k) ?? 0) + by);
}

// Sets a level. Unlike `inc`, calling it twice with the same value is not the
// same as calling it once — that is the point of a gauge.
export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  const k = keyOf(name, labels);
  if (!roomFor(gauges, name, k)) return;
  gauges.set(k, value);
}

// Removes a gauge, for a level that stopped existing rather than fell to zero:
// a queue that was dropped is not a queue of length nought.
export function clearGauge(name: string, labels: Record<string, string> = {}): void {
  gauges.delete(keyOf(name, labels));
}

// Seconds since the epoch, as Prometheus publishes start times. Set once at
// import: the module is loaded when the process comes up.
const startedAtSeconds = Date.now() / 1000;

// `typed` is passed in rather than made here: the two maps are rendered by two
// calls, and a name present in both would otherwise get two `# TYPE` lines with
// different types — an error by the format, and a name that means two things is
// a defect regardless.
function renderSeries(
  source: Map<string, number>,
  kind: "counter" | "gauge",
  typed: Set<string>,
): string[] {
  // Grouped by name: the format wants every line of a metric in one group, and
  // insertion order does not give that once a second series of an earlier name
  // appears. Sorting also makes a scrape diffable between two moments.
  const rows = [...source].map(([k, val]) => {
    const [name, labels] = partsOf(k);
    return { name, labels, val };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

  const lines: string[] = [];
  for (const { name, labels, val } of rows) {
    if (!typed.has(name)) {
      lines.push(`# TYPE ${name} ${kind}`);
      typed.add(name);
    }
    const keys = Object.keys(labels);
    const labelStr = keys.length
      ? "{" + keys.map((k) => `${k}="${escapeLabel(labels[k])}"`).join(",") + "}"
      : "";
    lines.push(`${name}${labelStr} ${formatValue(val)}`);
  }
  return lines;
}

export function render(): string {
  // Refreshed on every scrape rather than on a timer: the value is only ever
  // read here, and a timer would keep the process awake for nothing.
  setGauge("relay_process_start_time_seconds", startedAtSeconds);
  setGauge("relay_process_uptime_seconds", Math.round(Date.now() / 1000 - startedAtSeconds));
  // Written straight into the map, not through `inc`: at the ceiling `inc` is
  // exactly what refuses, and the number saying so must not be the first casualty.
  for (const [name, count] of dropped) {
    counters.set(keyOf("relay_metrics_writes_dropped_total", { metric: name }), count);
  }
  // Straight into the map, not through `setGauge`: at the ceiling `setGauge` is
  // what refuses, and the gauge that reports the state of the maps must not be
  // subject to it. Counted after both rows exist — computing the size before
  // inserting this one made the gauge wrong about itself, always by one.
  gauges.set(keyOf("relay_metrics_series", {}), 0);
  gauges.set(keyOf("relay_metrics_series", {}), counters.size + gauges.size);
  const typed = new Set<string>();
  const lines = [
    ...renderSeries(counters, "counter", typed),
    ...renderSeries(gauges, "gauge", typed),
  ];
  return lines.join("\n") + "\n";
}
