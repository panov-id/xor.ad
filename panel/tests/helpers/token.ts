// Mints a panel session JWT the way the relay does — HS256 over Web Crypto,
// which Node has had globally since 18. Deliberately a copy of the ~15 lines in
// relay/node/src/lib/jwt.ts rather than an import: that file is Deno-flavoured
// (`.ts` specifiers, Deno-only imports downstream), and a test suite reaching
// into the node's source tree would break the moment either side moved.
//
// The claim shape must match relay/node/src/lib/auth.ts, which rebuilds the
// caller straight from the claims and never looks the user up — so a token
// minted here is a full session, and the secret is the only thing gating it.

import { SESSION_SECRET } from "./env";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export type PanelRole = "admin" | "moderator";

export async function mintToken(
  email: string,
  role: PanelRole = "admin",
  ttlSeconds = 3600,
): Promise<string> {
  const header = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        sub: email,
        role,
        // null = platform scope, which is what the panel suite exercises.
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
