// Minimal pattern router alongside main.ts's exact-match map, so routes can carry
// path params (e.g. /admin/panel-users/:email). Register with route(); resolve
// with match(). First registered match wins.

export interface Ctx {
  req: Request;
  params: Record<string, string>;
  url: URL;
}
export type Handler = (c: Ctx) => Response | Promise<Response>;

const table: Array<{ method: string; re: RegExp; keys: string[]; h: Handler }> = [];

export function route(method: string, pattern: string, h: Handler): void {
  const keys: string[] = [];
  const source = "^" + pattern.replace(/:([A-Za-z]+)/g, (_, k: string) => {
    keys.push(k);
    return "([^/]+)";
  }) + "$";
  table.push({ method, re: new RegExp(source), keys, h });
}

export function match(
  method: string,
  path: string,
): { h: Handler; params: Record<string, string> } | null {
  for (const r of table) {
    if (r.method !== method) continue;
    const m = r.re.exec(path);
    if (m) {
      const params = Object.fromEntries(
        r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]),
      );
      return { h: r.h, params };
    }
  }
  return null;
}
