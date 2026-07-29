// Mints a panel session JWT the way the relay does — HS256 over Web Crypto,
// global in Node since 18. A copy of the few lines in
// relay/node/src/lib/jwt.ts rather than an import: that file is Deno-flavoured,
// and a Playwright suite reaching into the node's source tree would break the
// moment either side moved.

import { SESSION_SECRET } from "./env";

const encoder = new TextEncoder();
const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

export async function mintAdminToken(
  email = "e2e@local",
  ttlSeconds = 3600,
): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        sub: email,
        role: "admin",
        // null = platform scope: the check has to see both faces' leads.
        brand: null,
        exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      }),
    ),
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return `${data}.${base64url(new Uint8Array(signature))}`;
}
