// Signing a request, protocol §2 — the depth client's core.
//
// No DOM, no Ink, no import from the node: chat spec §13 puts the terminal first
// so that the protocol is written from the client's side too, and a client that
// borrowed the server's implementation would agree with the server's mistakes.
// depth/core/sign.test.ts checks the two against each other.
//
// The signed line is five fields joined by "\n": the method; the authority —
// the host lowercased, a default port dropped; the path with its query sorted by
// name, then value, each percent-encoded; the SHA-256 of the body in hex; and
// the time in seconds. The key is ECDSA P-256 with SHA-256; the signature goes
// base64url in `x-identity-sign`, with the session and the time beside it.

const P256 = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN = { name: "ECDSA", hash: "SHA-256" } as const;

export interface SigningKey {
  privateKey: CryptoKey;
  // The public half as base64url SPKI — what POST /identities takes as sign_pub.
  publicSpki: string;
}

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function sha256hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateSigningKey(): Promise<SigningKey> {
  const pair = await crypto.subtle.generateKey(P256, true, ["sign", "verify"]) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { privateKey: pair.privateKey, publicSpki: base64url(spki) };
}

function authority(url: URL): string {
  const defaultPort = url.port === "" ||
    (url.protocol === "https:" && url.port === "443") ||
    (url.protocol === "http:" && url.port === "80");
  return url.hostname.toLowerCase() + (defaultPort ? "" : `:${url.port}`);
}

function pathWithQuery(url: URL): string {
  const pairs = [...url.searchParams.entries()].sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0
  );
  if (pairs.length === 0) return url.pathname;
  return `${url.pathname}?${pairs.map(([n, v]) => `${encodeURIComponent(n)}=${encodeURIComponent(v)}`).join("&")}`;
}

// The headers of a signed request. The time is taken here unless given, so a
// test can pin it; the node refuses anything outside ±5 minutes.
export async function signRequest(
  key: SigningKey,
  sessionId: string,
  method: string,
  url: string,
  body: Uint8Array,
  time = Math.floor(Date.now() / 1000),
): Promise<Record<string, string>> {
  const target = new URL(url);
  const line = [method, authority(target), pathWithQuery(target), await sha256hex(body), String(time)].join("\n");
  const signature = new Uint8Array(
    await crypto.subtle.sign(SIGN, key.privateKey, new TextEncoder().encode(line)),
  );
  return {
    "x-identity-session": sessionId,
    "x-identity-time": String(time),
    "x-identity-sign": base64url(signature),
  };
}
