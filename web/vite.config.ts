import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The node the page talks to. The core (depth/core/client.ts) calls the node
// by absolute path — /identities, /feed — so the page cannot put its calls
// under a prefix of its own: this server forwards the node's own paths, by
// their first segment, and serves everything else itself. Since W1b
// (2026-09-26) the node's CORS lets a signed call's headers through, so a
// page may also call the node on its own origin; the stand keeps the
// forwarding because one origin needs no ALLOWED_ORIGINS and no https, and a
// gateway in front of a real deployment forwards the same way.
const node = process.env.WEB_NODE_URL ?? "http://localhost:62080";
// The first segments of the node's person-facing routes (relay/node/src/routes),
// without the panel's /admin, /auth, /o and /v1.
// "chat" is the conversation's socket, GET /chat (protocol §4.4), forwarded
// with `ws: true` below (W3, 2026-09-26).
const NODE_PATHS = ["away", "blocks", "chat", "chats", "feed", "hidden", "identities", "inbox", "legal", "likes", "limits", "matches", "offers", "recovery", "sessions", "statements", "support", "tables", "vault", "health"];
// Host stays the page's: the signature covers the authority the person called
// (identity_auth.ts signedAuthority), and the node reads it from the request.
// The cabinet (A1): the node knows the storefront by the cabinet's Origin,
// adv.<storefront> (relay/node/src/lib/adv.ts brandOfOrigin). A real cabinet
// is served there; the stand serves it under /adv on its own origin and says
// the cabinet's Origin for it — only when WEB_ADV_ORIGIN is set, which
// docker-compose.web.yml does and nothing else.
const advOrigin = process.env.WEB_ADV_ORIGIN;
// https for the stand's cabinet service (WEB_TLS=1, web/Dockerfile makes the
// certificate): the cabinet's __Host- cookies are kept only from https.
const tls = process.env.WEB_TLS === "1"
  ? { key: readFileSync("/repo/tls.key"), cert: readFileSync("/repo/tls.crt") }
  : undefined;
const proxy = {
  // A browser opening /adv gets the page; the page's calls go to the node.
  "^/adv(/|$)": {
    target: node,
    changeOrigin: false,
    ...(advOrigin ? { headers: { origin: advOrigin } } : {}),
    bypass: (req: { headers: { accept?: string } }) => ((req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined),
  },
  [`^/(${NODE_PATHS.join("|")})(/|$|\\?)`]: { target: node, changeOrigin: false, ws: true },
  // An offer's link, `<storefront>/o/<code>` (offers spec §6.2; W5): the same
  // path is a page and a node route. A browser navigating there (Accept
  // text/html) gets the page, which then asks the node for JSON at the same
  // path; `/o/<code>/go` is always the node's — its answer is the 302.
  "^/o/": {
    target: node,
    changeOrigin: false,
    bypass: (req: { url?: string; headers: { accept?: string } }) =>
      /^\/o\/[A-Za-z0-9_-]+\/?(\?.*)?$/.test(req.url ?? "") && (req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined,
  },
};

// depth/core lives outside this package: the screens import it by relative
// path, as the terminal face does (depth/ink), so there is one core.
const core = fileURLToPath(new URL("../depth/core", import.meta.url));
// And the terminal's words: the "me" screens say what depth says, verbatim.
const locales = fileURLToPath(new URL("../depth/ink/locales", import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: { proxy, fs: { allow: [".", core, locales] }, allowedHosts: ["host.docker.internal", "web"] },
  preview: { proxy, allowedHosts: ["host.docker.internal", "web", "web-adv"], ...(tls ? { https: tls } : {}) },
  // depth/core names hash-wasm bare; resolved from this package's node_modules,
  // as depth/deno.json maps it for Deno.
  resolve: { alias: { "hash-wasm": fileURLToPath(new URL("./node_modules/hash-wasm", import.meta.url)) } },
});
