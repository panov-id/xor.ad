// Whose address is this, really.
//
// A header claiming to be the client's address is worth exactly as much as the
// hop that set it. Bunny sends `X-Real-IP` with the visitor's address and adds a
// shared secret by an edge rule; anything arriving without that secret came
// straight at the node, and its headers are the sender's own invention. Trusting
// them there would hand a rate limiter its own defeat: pick a fresh address per
// request and the limit never fires.
//
// So: the header counts when the request proves it came through the CDN, and
// otherwise the connection's own address is used — which cannot be forged,
// because packets have to come back.

import { config } from "../config.ts";

// Set where the connection is accepted; read wherever the address is needed.
// Weak so a finished request takes its entry with it.
const remotes = new WeakMap<Request, string>();

export function rememberRemote(req: Request, hostname: string | undefined): void {
  if (hostname) remotes.set(req, hostname);
}

export interface ClientAddress {
  ip: string;
  // Whether the address came from a header we had reason to believe. Callers
  // that log or count may care; callers that limit generally should not.
  viaEdge: boolean;
}

export function clientAddress(req: Request): ClientAddress {
  const token = config.originToken;
  const presented = req.headers.get("x-origin-token");

  if (token && presented === token) {
    // A header name we chose, because the obvious one is not ours to set:
    // Bunny reserves X-Real-IP and silently ignores an edge rule that writes it.
    // Verified against an echo origin — a static header arrived, X-Real-IP never
    // did, and the same value under X-Client-IP arrived every time.
    const client = req.headers.get("x-client-ip")?.trim();
    if (client) return { ip: client, viaEdge: true };

    // Kept for any other proxy in front of a node, and for the day the CDN
    // starts sending it.
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return { ip: real, viaEdge: true };

    // X-Forwarded-For is "client, proxy1, proxy2…" — the first entry is the one
    // the edge saw. Used only as a fallback: Bunny sends X-Real-IP, and a chain
    // is easier to spoof one entry into.
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return { ip: first, viaEdge: true };
    }
  }

  // Not through the CDN — but still not a direct connection: every request
  // reaches this process through Caddy on the same box, so the connection's
  // address is Caddy's and identical for everybody. Counting by it would put the
  // whole world in one bucket and let a single script refuse signups for
  // everyone, which is the very thing this limiter exists to prevent.
  //
  // Caddy sets X-Forwarded-For, and nothing else can: the node's port is not
  // published, so the only peer able to reach it is the proxy beside it.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // The LAST entry, not the first. A chain reads "client, proxy1, proxy2…",
    // and every entry except the one our own proxy appended was written by
    // somebody we have no reason to believe. Caddy 2.7 and later happens to
    // discard an incoming X-Forwarded-For from an untrusted peer, which makes
    // first and last the same value here — but that is its default, not our
    // guarantee, and `trusted_proxies` would change it. Taking the last entry is
    // correct either way.
    const parts = forwarded.split(",").map((part) => part.trim()).filter(Boolean);
    const nearest = parts[parts.length - 1];
    if (nearest) return { ip: nearest, viaEdge: false };
  }

  return { ip: remotes.get(req) || "unknown", viaEdge: false };
}

// Whether a request that claims to come through the edge actually proved it.
// The token is optional in config: a node with none simply never trusts a header,
// which is the correct behaviour for dev and for any node not behind the CDN.
export function cameThroughEdge(req: Request): boolean {
  const token = config.originToken;
  return Boolean(token) && req.headers.get("x-origin-token") === token;
}
