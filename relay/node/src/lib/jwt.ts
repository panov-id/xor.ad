// Minimal HS256 JWT (sign/verify) over the built-in Web Crypto — no external
// dependency, so the node image stays self-contained. Used for panel sessions.

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replaceAll("-", "+").replaceAll("_", "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
const enc = new TextEncoder();
// TS 5.7 made Uint8Array generic over its buffer; Web Crypto wants a plain
// BufferSource, so normalize at each boundary.
const buf = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

async function hmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    buf(enc.encode(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface Claims {
  sub: string;
  role: string;
  exp: number; // unix seconds
  [k: string]: unknown;
}

export async function sign(claims: Claims, secret: string): Promise<string> {
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64urlEncode(enc.encode(JSON.stringify(claims)));
  const data = `${header}.${payload}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), buf(enc.encode(data)));
  return `${data}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verify(token: string, secret: string): Promise<Claims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    buf(b64urlDecode(sig)),
    buf(enc.encode(`${header}.${payload}`)),
  );
  if (!ok) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as Claims;
    if (typeof claims.exp !== "number" || Date.now() / 1000 > claims.exp) return null;
    return claims;
  } catch {
    return null;
  }
}
