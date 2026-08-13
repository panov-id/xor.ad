// Build the security headers for the built panel, from the bytes about to be
// uploaded.
//
//   node deploy/panel-security-headers.mjs <dist-dir>
//
// Prints one JSON object: { headers: [{name, value}], counted: {...} }.
//
// Separate from the landings' script on purpose. The two faces differ in every
// way that matters here: the panel is a Vite bundle with one bootstrap inline
// script and no style attributes, its stylesheets arrive as files rather than
// inline, and the host it talks to is a control plane rather than a public API.
// One script serving both would carry two sets of exceptions and explain
// neither.
//
// It is also the more dangerous of the two to get wrong: people reach the panel
// by a link from an email, and a page that silently does nothing looks like a
// broken link rather than a broken policy.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = process.argv[2];
if (!dist) {
  console.error("usage: panel-security-headers.mjs <dist-dir>");
  process.exit(2);
}

const sha256 = (value) => `'sha256-${createHash("sha256").update(value, "utf8").digest("base64")}'`;

function htmlFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...htmlFiles(path));
    else if (entry.endsWith(".html")) found.push(path);
  }
  return found;
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const INLINE_STYLE = /<style[^>]*>([\s\S]*?)<\/style>/g;
const STYLE_ATTRIBUTE = /\sstyle="([^"]*)"/g;
const EXECUTABLE = (attributes) => {
  const type = /\btype\s*=\s*"([^"]*)"/.exec(attributes)?.[1]?.toLowerCase();
  return !type || type === "text/javascript" || type === "module";
};

const scripts = new Set();
const styles = new Set();
const styleAttributes = new Set();

const pages = htmlFiles(dist);
for (const page of pages) {
  const html = readFileSync(page, "utf8");
  for (const [, attributes, body] of html.matchAll(INLINE_SCRIPT)) {
    if (EXECUTABLE(attributes)) scripts.add(sha256(body));
  }
  for (const [, body] of html.matchAll(INLINE_STYLE)) styles.add(sha256(body));
  for (const [, value] of html.matchAll(STYLE_ATTRIBUTE)) styleAttributes.add(sha256(value));
}

// Baked into the bundle at build time, so the deploy has to be told the same
// value rather than reading it back out of minified JavaScript.
const configured = process.env.VITE_RELAY_API_URL || "";
if (!configured) {
  console.error("VITE_RELAY_API_URL is not set — the panel would be unable to reach the relay");
  process.exit(1);
}

// A CSP source carrying a path matches that exact path, so `https://relay/v1`
// would permit one request and block every other — while the application, which
// concatenates onto the same string, works fine. The two disagree silently and
// only in production, so the value is checked rather than trusted or quietly
// trimmed: a secret with a path in it is a mistake for a person to fix.
let relay;
try {
  const parsed = new URL(configured);
  if (parsed.origin !== configured.replace(/\/$/, "")) {
    throw new Error(`expected a bare origin, got ${configured}`);
  }
  relay = parsed.origin;
} catch (error) {
  console.error(`VITE_RELAY_API_URL is not a usable CSP source: ${error.message}`);
  process.exit(1);
}

// Where the browser says the policy blocked something. The policy is computed
// at deploy time from the markup, so it drifts by construction, and until this
// existed the only thing between a drifted policy and a dead page was somebody
// remembering to open the console. Both spellings are set: report-to is the
// current one and the only one Chrome honours, report-uri is deprecated and the
// only one Firefox and Safari honour.
const reportTo = `${relay}/csp-report`;

// The panel's stylesheets are files, not inline blocks, and the built page has no
// style attributes. So style-src starts strict, with no 'unsafe-inline' and no
// 'unsafe-hashes' — if a dependency injects a <style> at runtime the browser
// check says so, and the exception gets made deliberately rather than in
// advance.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  // 'unsafe-hashes' is what lets a hash apply to a style attribute rather than
  // only to a <style> block; without it the attribute hashes below are
  // decoration the browser ignores, and this file was emitting them anyway.
  // Added only when there is an attribute to cover, so a panel with none — which
  // is the panel today — keeps the strict policy it has rather than being handed
  // a loosening in advance.
  `style-src 'self' ${styleAttributes.size ? "'unsafe-hashes' " : ""}${
    [...styles, ...styleAttributes].join(" ")
  }`.trim(),
  `script-src 'self' ${[...scripts].join(" ")}`.trim(),
  `connect-src 'self' ${relay}`,
  `report-uri ${reportTo}`,
  "report-to csp",
  "upgrade-insecure-requests",
].join("; ");

const headers = [
  { name: "Content-Security-Policy", value: csp },
  // `report-to csp` above names a group; this header is what defines it.
  { name: "Reporting-Endpoints", value: `csp="${reportTo}"` },
  { name: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { name: "X-Content-Type-Options", value: "nosniff" },
  // The panel is where sessions live, so a referrer that leaks a path to another
  // site is worth less here than it costs. Same value as the landings, said for a
  // different reason.
  { name: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { name: "X-Frame-Options", value: "DENY" },
  { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

console.log(JSON.stringify({
  headers,
  counted: {
    pages: pages.length,
    inline_scripts: scripts.size,
    inline_styles: styles.size,
    style_attributes: styleAttributes.size,
    relay,
  },
}, null, 2));
