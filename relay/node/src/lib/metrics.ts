// Tiny in-memory Prometheus counters. Exposed at GET /metrics for scraping.

const counters = new Map<string, number>();

function keyOf(name: string, labels: Record<string, string>): string {
  const lbl = Object.keys(labels).sort().map((k) => `${k}=${labels[k]}`).join(",");
  return `${name}|${lbl}`;
}

export function inc(name: string, labels: Record<string, string> = {}, by = 1): void {
  const k = keyOf(name, labels);
  counters.set(k, (counters.get(k) ?? 0) + by);
}

export function render(): string {
  const lines: string[] = [];
  const typed = new Set<string>();
  for (const [k, val] of counters) {
    const [name, lbl] = k.split("|");
    if (!typed.has(name)) {
      lines.push(`# TYPE ${name} counter`);
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
  return lines.join("\n") + "\n";
}
