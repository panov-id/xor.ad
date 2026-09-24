// Minimal pattern router alongside dispatch.ts's exact-match map, so routes can carry
// path params (e.g. /admin/panel-users/:email). Register with route(); resolve
// with match(). First registered match wins.
//
// `match` hands back the pattern it matched, not only the handler: metrics label
// series by route, and a label built from the raw path puts the id itself into the
// series name. Production proved it on 2026-09-10 — three real Article 16 notice
// ids were readable in a public scrape as `POST /admin/dsa-notices/<uuid>/decide`.

export interface Ctx {
  req: Request;
  params: Record<string, string>;
  url: URL;
}
export type Handler = (c: Ctx) => Response | Promise<Response>;

const table: Array<{ method: string; re: RegExp; keys: string[]; h: Handler; pattern: string }> = [];

export function route(method: string, pattern: string, h: Handler): void {
  const keys: string[] = [];
  // Underscores and digits belong to a name. The pattern used to be
  // `:([A-Za-z]+)`, which took `:lookup_id` to mean the parameter `lookup`
  // followed by the literal text `_id` — so `/sessions/:lookup_id` matched
  // `/sessions/<anything>_id` and nothing else, and the route simply never
  // fired. Nothing failed at registration; the request came back "no route"
  // (found 2026-09-21 while adding the transfer).
  const source = "^" + pattern.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, k: string) => {
    keys.push(k);
    return "([^/]+)";
  }) + "$";
  table.push({ method, re: new RegExp(source), keys, h, pattern });
}

export function match(
  method: string,
  path: string,
): { h: Handler; params: Record<string, string>; pattern: string } | null {
  for (const r of table) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) {
      const params = Object.fromEntries(
        r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]),
      );
      return { h: r.h, params, pattern: r.pattern };
    }
  }
  return null;
}

// Methods the routing table names. Anything else becomes one series, not a series
// of its own: Deno hands the handler whatever the caller wrote — `FOOBAR`, sixty
// X's, `A|B` all arrive as `req.method` with a 200 (measured 2026-09-10) — so a
// label built from the raw method grows the metrics map exactly the way a label
// built from the raw path did.
const KNOWN_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS", "HEAD"]);

// The label a request is counted under. Lives here rather than inline in dispatch.ts
// so it can be exercised on its own: main.ts starts a server on import, and a
// rule nobody can call is a rule nobody tests.
export function metricLabel(
  method: string,
  path: string,
  opts: { exact?: boolean; pattern?: string } = {},
): string {
  const m = KNOWN_METHODS.has(method) ? method : "<other>";
  if (opts.exact) return `${m} ${path}`;
  if (opts.pattern) return `${m} ${opts.pattern}`;
  return `${m} <unmatched>`;
}
