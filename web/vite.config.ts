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
// The kit's tokens and faces (WD1): tokens.css names its fonts /fonts/<file>,
// as the sheets are served; here that path is the kit's font folder, so the
// build bundles them as the page's own assets.
const kit = fileURLToPath(new URL("../panel/design/kit", import.meta.url));
const fonts = fileURLToPath(new URL("../panel/design/fonts/", import.meta.url));

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

// The brand on <html> from the build (config.ts reads the same VITE_BRAND), so
// themes.gen.css draws the brand's light theme from the first paint, before
// the page's module (theme.ts) sets data-theme. An attribute, not a script:
// nothing for the CSP to refuse. Dev and build alike.
const brandName = process.env.VITE_BRAND === "neighbro" ? "neighbro" : "sosed";
const brand = {
  name: "xor-brand",
  transformIndexHtml: (html: string) => html.replace("<html ", `<html data-brand="${process.env.VITE_BRAND ?? "sosed"}" `),
};

// A font is never inlined (VF1): a small subset (JetBrains Mono's Cyrillic
// extension, 1640 bytes) went under the 4 KiB limit into a data: URL, which
// font-src 'self' refuses — the policy stays as it is, the font stays a file.
const assetsInlineLimit = (file: string) => (/\.woff2?$/.test(file) ? false : undefined);

export default defineConfig({
  build: { assetsInlineLimit },
  plugins: [react(), csp, brand],
  server: { proxy, fs: { allow: [".", core, locales, kit, fonts] }, allowedHosts: ["host.docker.internal", "web"] },
  preview: {
    proxy,
    allowedHosts: ["host.docker.internal", "web", "web-adv"],
    headers: { "content-security-policy": CSP_HEADER },
    ...(tls ? { https: tls } : {}),
  },
  // depth/core names hash-wasm bare; resolved from this package's node_modules,
  // as depth/deno.json maps it for Deno.
  resolve: {
    alias: [
      { find: "hash-wasm", replacement: fileURLToPath(new URL("./node_modules/hash-wasm", import.meta.url)) },
      { find: /^\/fonts\//, replacement: fonts },
      // The brand's views (src/brands/index.ts): one tree in the bundle.
      { find: /^@brand$/, replacement: fileURLToPath(new URL(`./src/brands/${brandName}/index.tsx`, import.meta.url)) },
    ],
  },
});
