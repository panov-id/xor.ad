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
const node = process.env.APP_NODE_URL ?? "http://localhost:62080";
// The first segments of the node's person-facing routes (relay/node/src/routes),
// without the panel's /admin, /auth, /o and /v1.
// "chat" is the conversation's socket, GET /chat (protocol §4.4), forwarded
// with `ws: true` below (W3, 2026-09-26).
const NODE_PATHS = ["away", "blocks", "chat", "chats", "feed", "hidden", "identities", "inbox", "legal", "likes", "limits", "matches", "offers", "recovery", "report", "sessions", "statements", "support", "tables", "vault", "health"];
// Host stays the page's: the signature covers the authority the person called
// (identity_auth.ts signedAuthority), and the node reads it from the request.
// The cabinet (A1): the node knows the storefront by the cabinet's Origin,
// adv.<storefront> (relay/node/src/lib/adv.ts brandOfOrigin). A real cabinet
// is served there; the stand serves it under /adv on its own origin and says
// the cabinet's Origin for it — only when WEB_ADV_ORIGIN is set, which
// docker-compose.web.yml does and nothing else.
const advOrigin = process.env.WEB_ADV_ORIGIN;
const proxy = {
  // A browser opening /adv gets the page; the page's calls go to the node.
  "^/adv(/|$)": {
    target: node,
    changeOrigin: false,
    ...(advOrigin ? { headers: { origin: advOrigin } } : {}),
    bypass: (req: { headers: { accept?: string } }) => ((req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined),
  },
  // The face's own addresses share first segments with the node (/feed, /tables,
  // /inbox, /chat …; the face's router): a browser navigating there — a reload,
  // a typed address, Accept text/html — gets the page; the page's fetches
  // (Accept */*) and the chat's socket still go to the node.
  [`^/(${NODE_PATHS.join("|")})(/|$|\\?)`]: {
    target: node,
    changeOrigin: false,
    ws: true,
    bypass: (req: { headers: { accept?: string } }) => ((req.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined),
  },
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

// depth/core lives outside this package: the shell imports it as @sdk.
const core = fileURLToPath(new URL("../depth/core", import.meta.url));
// The browser's own half of the SDK (IndexedDB, sessionStorage, the idle inputs): shared with web/, imported as @platform.
const platform = fileURLToPath(new URL("../depth/web-platform", import.meta.url));
// The words are the web's and the terminal's, read in place (never copied, never written):
// web/src/locales/<lang>.json ("web.*" keys) and depth/ink/locales/<lang>.json (see src/i18n.ts).
const webLocales = fileURLToPath(new URL("../web/src/locales", import.meta.url));
const inkLocales = fileURLToPath(new URL("../depth/ink/locales", import.meta.url));
// The city list of the place picker (depth/core/place.ts), the web's own file read in place: src/screens/me/cities.ts.
const cities = fileURLToPath(new URL("../web/src/geo/cities.json", import.meta.url));

// The page's Content-Security-Policy (FX5′, 27.09.2026). A script that runs on
// the page can do whatever the page can — take the long key it holds after the
// PIN, or the PIN as it is typed (X3) — so the only fence is that no script but
// the page's own runs at all: no inline script, no eval, no plugin, no <base>.
// 'wasm-unsafe-eval' is not eval: it lets WebAssembly compile, which Argon2
// (hash-wasm, depth/core pin.ts) needs; eval and new Function stay refused.
// Everything the page calls is its own origin — the node is forwarded here,
// as a gateway forwards it — and 'self' covers ws:/wss: to the same host.
const CSP_PAGE = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");
// frame-ancestors is ignored in a <meta> (CSP3 §6.1): only the header carries
// it, so a page served elsewhere without this header can still be framed.
const CSP_HEADER = `${CSP_PAGE}; frame-ancestors 'none'`;

// Into the built page only: the dev server injects its own inline React
// Refresh preamble, which this policy would refuse. The page as it is served —
// by preview, by a gateway, from a bucket — carries the policy with it.
const csp = {
  name: "xor-csp",
  apply: "build" as const,
  transformIndexHtml: (html: string) =>
    html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP_PAGE}" />`),
};

// The brand is src/brands/<VITE_BRAND>/ as in web/; this shell has sosed Dusk
// only for now, so VITE_BRAND is pinned to sosed.
const brandName = "sosed" as const; // src/brands/<VITE_BRAND>/ exists for sosed only so far
const brand = {
  name: "xor-brand",
  transformIndexHtml: (html: string) => html
    .replace("<html ", `<html data-brand="${brandName}" `)
    .replace("<title>sosed.place</title>", `<title>${brandName}.place</title>`),
};

// A font is never inlined: font-src 'self' refuses data: URLs.
const assetsInlineLimit = (file: string) => (/\.woff2?$/.test(file) ? false : undefined);

export default defineConfig({
  build: { assetsInlineLimit },
  plugins: [react(), csp, brand],
  server: { port: 5174, proxy, fs: { allow: [".", core, platform, webLocales, inkLocales, cities] }, allowedHosts: ["host.docker.internal", "app"] },
  preview: {
    port: 4174,
    proxy,
    allowedHosts: ["host.docker.internal", "app"],
    headers: { "content-security-policy": CSP_HEADER },
  },
  resolve: {
    alias: [
      { find: /^@sdk\//, replacement: `${core}/` },
      { find: /^@platform\//, replacement: `${platform}/` },
      { find: /^@locales\//, replacement: `${webLocales}/` },
      { find: /^@ink-locales\//, replacement: `${inkLocales}/` },
      { find: /^@cities$/, replacement: cities },
      { find: /^@brand$/, replacement: fileURLToPath(new URL(`./src/brands/${brandName}/index.ts`, import.meta.url)) },
    ],
  },
});
