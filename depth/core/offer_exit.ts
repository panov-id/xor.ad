// An offer link's exit screen, the reading part (offers spec §6.2): moved out of web/src/screens/Offer.tsx on
// 18.10.2026 so the web and the app shell (app/src/screens/Offer.tsx) ask the node the same way; unchanged.
// `<storefront>/o/<code>` is a page and a node route: the page asks the same path for JSON — the target's
// domain and whether the link is switched off. The external address is never shown, only its domain.
// Unsigned: the link is for anybody, registered or not.

export type Exit = { domain: string; disabled: boolean };
export type ExitState = { at: "loading" } | { at: "ok"; exit: Exit } | { at: "missing" } | { at: "failed" };

export const CODE = /^[A-Za-z0-9_-]{4,64}$/;

export async function readExit(code: string, fetcher: typeof fetch = fetch): Promise<ExitState> {
  if (!CODE.test(code)) return { at: "missing" };
  try {
    const r = await fetcher(`/o/${encodeURIComponent(code)}`, { headers: { accept: "application/json" } });
    if (r.status === 404) return { at: "missing" };
    if (r.status !== 200) return { at: "failed" };
    const body = (await r.json()) as Partial<Exit>;
    if (typeof body.domain !== "string" || typeof body.disabled !== "boolean") return { at: "failed" };
    return { at: "ok", exit: { domain: body.domain, disabled: body.disabled } };
  } catch {
    return { at: "failed" };
  }
}

/** The code of an offer link from a path: `/o/<code>` (a trailing slash allowed), else null. */
export function codeOfPath(path: string): string | null {
  const m = /^\/o\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  return m ? m[1] : null;
}
