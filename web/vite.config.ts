import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The node the page talks to. The core (depth/core/client.ts) calls the node
// by absolute path — /identities, /feed — so the page cannot put its calls
// under a prefix of its own: this server forwards the node's own paths, by
// their first segment, and serves everything else itself. The node's CORS
// allows only `authorization, content-type, x-api-key` on a preflight
// (relay/node/src/lib/cors.ts), while a signed call carries
// x-protocol-version and the three x-identity-* headers, which a cross-origin
// page cannot send until the node lists them — reported with W1 (2026-09-26);
// the gateway in front of a real deployment forwards the same way.
const node = process.env.WEB_NODE_URL ?? "http://localhost:62080";
// The first segments of the node's person-facing routes (relay/node/src/routes),
// without the panel's /admin, /auth, /o and /v1.
// "chat" is the conversation's socket, GET /chat (protocol §4.4), forwarded
// with `ws: true` below (W3, 2026-09-26).
const NODE_PATHS = ["away", "blocks", "chat", "chats", "feed", "hidden", "identities", "inbox", "legal", "likes", "limits", "matches", "recovery", "sessions", "statements", "support", "vault", "health"];
// Host stays the page's: the signature covers the authority the person called
// (identity_auth.ts signedAuthority), and the node reads it from the request.
const proxy = { [`^/(${NODE_PATHS.join("|")})(/|$|\\?)`]: { target: node, changeOrigin: false, ws: true } };

// depth/core lives outside this package: the screens import it by relative
// path, as the terminal face does (depth/ink), so there is one core.
const core = fileURLToPath(new URL("../depth/core", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { proxy, fs: { allow: [".", core] }, allowedHosts: ["host.docker.internal", "web"] },
  preview: { proxy, allowedHosts: ["host.docker.internal", "web"] },
  // depth/core names hash-wasm bare; resolved from this package's node_modules,
  // as depth/deno.json maps it for Deno.
  resolve: { alias: { "hash-wasm": fileURLToPath(new URL("./node_modules/hash-wasm", import.meta.url)) } },
});
