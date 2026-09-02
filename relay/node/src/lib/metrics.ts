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

const counters = new Map<string, number>();
const gauges = new Map<string, number>();

function keyOf(name: string, labels: Record<string, string>): string {
  const lbl = Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join(",");
  return `${name}|${lbl}`;
}

export function inc(name: string, labels: Record<string, string> = {}, by = 1): void {
  const k = keyOf(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + by);
}

// Sets a level. Unlike `inc`, calling it twice with the same value is not the
// same as calling it once — that is the point of a gauge.
export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  gauges.set(keyOf(name, labels), value);
}

// Removes a gauge, for a level that stopped existing rather than fell to zero:
// a queue that was dropped is not a queue of length nought.
export function clearGauge(name: string, labels: Record<string, string> = {}): void {
  gauges.delete(keyOf(name, labels));
}

// Seconds since the epoch, as Prometheus publishes start times. Set once at
// import: the module is loaded when the process comes up.
const startedAtSeconds = Date.now() / 1000;

function renderSeries(source: Map<string, number>, kind: "counter" | "gauge"): string[] {
  const lines: string[] = [];
  const typed = new Set<string>();
  for (const [k, val] of source) {
    const [name, lbl] = k.split("|");
    if (!typed.has(name)) {
      lines.push(`# TYPE ${name} ${kind}`);
      typed.add(name);
    }
    const labelStr = lbl
      ? "{" + lbl.split(",").filter(Boolean).map((p) => {
        const i = p.indexOf("=");
        return `${p.slice(0, i)}="${p.slice(i + 1)}"`;
      }).join(",") + "}"
      : "";
    lines.push(`${name}${labelStr} ${val}`);
  }
  return lines;
}

export function render(): string {
  // Refreshed on every scrape rather than on a timer: the value is only ever
  // read here, and a timer would keep the process awake for nothing.
  setGauge("relay_process_start_time_seconds", startedAtSeconds);
  setGauge("relay_process_uptime_seconds", Math.round(Date.now() / 1000 - startedAtSeconds));
  const lines = [...renderSeries(counters, "counter"), ...renderSeries(gauges, "gauge")];
  return lines.join("\n") + "\n";
}
