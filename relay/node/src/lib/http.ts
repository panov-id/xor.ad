// Small HTTP helpers shared by the routes.

// Every JSON answer this node gives is per-request, and several carry things
// that must not be stored by anybody: the node's half of a vault key, the long
// key wrapped under a paper code, a session id, somebody's profile.
//
// Until 2026-09-20 nothing said so, and the edge filled the silence with the
// wrong word. Measured against the live api host that day:
//
//     $ curl -si https://api.relay.panov.id/health
//     cache-control: public, max-age=0
//
// `public` explicitly permits a shared cache to store the response. Bunny
// writes it because the zone is configured with a max-age override and the
// origin says nothing to override (deploy/bunny-api-zone.sh). `no-store` from
// here is the answer, and it is the origin's job regardless of what any one
// CDN does with it — the next CDN will do something else.
//
// `Vary` names the two headers an answer actually depends on: the session that
// signed the request and the storefront key it came with. A shared cache that
// ignores `no-store` would otherwise be free to hand one person's profile to
// the next caller of the same path.
export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "vary": "x-identity-session, x-api-key",
      ...headers,
    },
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

// Conservative email check — enough to reject obvious garbage before storing.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL.test(value);
}
