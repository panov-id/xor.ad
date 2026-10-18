// Measures the real rendered app/ (splash, splash-lang, loading, register-1..3, unlock, locked, the move, away) against the Dusk sheets
// mobile/w2_{splash,splash-lang,loading,unlock,locked,departure-*,arrival-*,away}.svg and mobile/w1_register-{1,2,3}.svg; walks the registration, the reload, the PIN, the lock, the move
// and the web<->app interop against a stubbed node. Run by scripts/measure-app.sh inside the Playwright
// image, on an internal network: PREVIEW (the built app, with its CSP) and DEV (the dev server, for
// the ?boot=<ms> hook, which exists in dev only) are two ports of the container called `app`.
//
// Expected values are read from the sheets (sheet-geometry.mjs), never typed in. Per element: left/top/width/height
// of the box (CSS px) against the shape drawn on the sheet; per text line: left/right edge and baseline against
// the sheet's ink (the DOM has no ink, so an edge may differ by a glyph's side bearing: that is what the 2 px is for).
// The shape and line lists are matched by order (the order the sheets draw them in).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { readSheet } from "./sheet-geometry.mjs";

const SHEETS = process.env.SHEETS ?? "/sheets";
// localhost: the registration needs WebCrypto (crypto.subtle), which a browser gives to https and localhost only.
const PREVIEW = process.env.PREVIEW_URL ?? "http://localhost:4174";
const DEV = process.env.DEV_URL ?? "http://localhost:5174";
const SHOTS = process.env.SHOTS ?? "/shots";
const TOL = Number(process.env.TOL ?? 2);
const LOCALE = process.env.LANG_TAG ?? "en-US";
const GEOMETRY = process.env.GEOMETRY !== "0";      // 0: the sheets are English, so a run in another language checks fonts and overflow only
const TAG = LOCALE.slice(0, 2);
const RU = TAG === "ru";                           // Cyrillic must render with the loaded face: asserted in the ru run (the face loads on use)
const OVERRIDE = process.env.CSS_OVERRIDE ?? "";    // positive control: injected into the page, bypassing the CSP
const sheet = (n) => readSheet(`${SHEETS}/w2_${n}.svg`);
const regSheet = (n) => readSheet(`${SHEETS}/w1_register-${n}.svg`);

const rows = [];       // { screen, name, exp, act, delta, ok }
const notes = [];      // overflow / font lines
const csp = [];
const NAN4 = [NaN, NaN, NaN, NaN], NAN3 = [NaN, NaN, NaN];
const fmt = (a) => a.map((v) => (Number.isNaN(v) ? "-" : v.toFixed(1))).join(",");
function compare(screen, name, exp, act) {
  if (!GEOMETRY) return;
  const d = exp.map((e, i) => act[i] - e);
  const ok = d.every((x) => !Number.isNaN(x) && Math.abs(x) <= TOL);
  rows.push({ screen, name, exp: fmt(exp), act: fmt(act), delta: d.map((x) => (Number.isNaN(x) ? "NaN" : (x >= 0 ? "+" : "") + x.toFixed(1))).join(","), ok });
}
// Text: the left edge and the baseline are compared. The right edge (the line's width) is information only: the sheets'
// words are not the app's (the sheet says "neighbours", "Choose your language", its own language list), so a width
// differs where the words differ; it is printed as a "text width" line.
const widths_ = [];
function textCompare(screen, name, exp, act) {
  compare(screen, name, [exp.left, exp.base], act ? [act[0], act[2]] : [NaN, NaN]);
  if (GEOMETRY) widths_.push(`${screen} ${name}: sheet ${(exp.right - exp.left).toFixed(0)} px wide, app ${act ? (act[1] - act[0]).toFixed(0) : "-"}`);
}
const shapeOf = (s) => [s.x, s.y, s.w, s.h];

// ── in the page ──
async function settle(page) {
  // finite entry animations run to their end state, infinite loops (pulse, spin) stop: boxes then hold the layout, not a frame
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
const boxOf = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }), sel);
// text lines of an element: per visual line the advance box and the baseline (line box centre + font ascent)
const linesOf = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s); if (!el) return [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const byTop = new Map();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const cs = getComputedStyle(n.parentElement);
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const m = ctx.measureText("Hg");
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      const base = r.top + (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      const key = Math.round(base);
      const L = byTop.get(key);
      if (L) { L.left = Math.min(L.left, r.left); L.right = Math.max(L.right, r.right); } else byTop.set(key, { left: r.left, right: r.right, base });
    }
  }
  return [...byTop.values()].sort((a, b) => a.base - b.base).map((l) => [l.left, l.right, l.base]);
}, sel);

async function overflowAt(page, screen, w) {
  const bad = await page.evaluate((vw) => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) out.push(`document scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}`);
    if (document.body.scrollWidth > document.body.clientWidth) out.push(`body scrollWidth ${document.body.scrollWidth} > clientWidth ${document.body.clientWidth}`);
    for (const e of document.querySelectorAll("[data-screen], [data-screen] *")) {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      const tag = `${e.tagName.toLowerCase()}${e.dataset.testid ? `[${e.dataset.testid}]` : typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : ""}`;
      if (r.width && (r.right > vw + 0.5 || r.left < -0.5)) out.push(`${tag} outside the viewport: ${r.left.toFixed(1)}..${r.right.toFixed(1)} of ${vw}`);
      const clips = cs.overflowX !== "visible" || cs.textOverflow === "ellipsis";
      if (!e.classList.contains("sr-only") && clips && e.scrollWidth > e.clientWidth + 1) out.push(`${tag} clips horizontally: scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
      if (!e.classList.contains("sr-only") && (cs.overflowY === "hidden" || cs.overflowY === "clip") && e.scrollHeight > e.clientHeight + 1) out.push(`${tag} clips vertically: scrollHeight ${e.scrollHeight} > clientHeight ${e.clientHeight}`);
    }
    return out;
  }, w);
  notes.push({ bad: bad.length > 0, text: `overflow/clipping ${screen}[${TAG}] @${w}: ${bad.length ? bad.slice(0, 6).join("; ") : "none"}` });
}

async function fonts(page, screen, probes) {
  const info = await page.evaluate(() => {
    const faces = []; document.fonts.forEach((f) => faces.push(`${f.family} ${f.weight} ${f.status} [${f.unicodeRange.slice(0, 22)}]`));
    return { faces, cyr: document.fonts.check("16px Outfit", "Привет"), lat: document.fonts.check("16px Outfit", "Hello") };
  });
  const loaded = info.faces.filter((f) => f.includes(" loaded "));
  notes.push({ bad: (RU && !info.cyr) || !info.lat || loaded.length === 0, text: `fonts ${screen}[${TAG}]: check('16px Outfit','Привет')=${info.cyr} check(...,'Hello')=${info.lat}; FontFace loaded ${loaded.length} of ${info.faces.length}: ${loaded.map((f) => f.split(" [")[0] + " [" + f.split("[")[1]).join(" | ") || "none"}` });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  for (const [label, sel] of probes) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
    if (!nodeId) { notes.push({ bad: true, text: `fonts ${screen}[${TAG}] ${label}: ${sel} not found` }); continue; }
    const { fonts: used } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    const text = used.map((f) => `${f.familyName}${f.isCustomFont ? " (loaded face)" : " (SYSTEM)"} x${f.glyphCount}`).join(", ");
    notes.push({ bad: used.length === 0 || used.some((f) => !f.isCustomFont), text: `fonts ${screen}[${TAG}] ${label}: rendered with ${text || "nothing"}` });
  }
  await cdp.detach();
}

async function open(browser, url, width, { locale = LOCALE, dsf = 1, asked = true, screen, prepare }) {
  const h = width === 390 ? 844 : width === 834 ? 1194 : 900;
  const ctx = await browser.newContext({ viewport: { width, height: h }, deviceScaleFactor: dsf, locale, isMobile: width < 768, hasTouch: width < 768, bypassCSP: !!OVERRIDE });
  await ctx.addInitScript((a) => {
    if (a) { try { localStorage.setItem("lang-asked", "1"); } catch {} }
    document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI + " @" + e.sourceFile + ":" + e.lineNumber + ":" + e.columnNumber + " [" + e.sample + "]"));
  }, asked);
  const page = await ctx.newPage();
  if (prepare) await prepare(ctx, page);
  page.on("console", (m) => { if (m.type() === "error" && !(screen.startsWith("walk-") && /Failed to load resource/.test(m.text()))) csp.push(`${screen}@${width} console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => csp.push(`${screen}@${width} pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(url, { waitUntil: "load" });
  if (OVERRIDE) await page.addStyleTag({ content: OVERRIDE });
  return { ctx, page };
}

async function shot(browser, url, name, opts) {
  if (!GEOMETRY) return;
  const { ctx, page } = await open(browser, url, 390, { ...opts, dsf: 0.5, screen: name + "-shot" });
  await page.waitForSelector(opts.wait); await settle(page);
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  await ctx.close();
}
async function widths(browser, url, screen, wait, opts = {}) {
  for (const w of [834, 1440]) {
    const o = await open(browser, url, w, { ...opts, screen });
    await o.page.waitForSelector(wait); await settle(o.page); await overflowAt(o.page, screen, w); await o.ctx.close();
  }
}

// ── run ──
const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });
for (const u of [PREVIEW, DEV]) {   // wait for both servers
  for (let i = 0; ; i++) {
    try { if ((await fetch(u)).ok) break; } catch {}
    if (i > 120) { console.log(`measure-app: SPOILED (${u} never answered)`); process.exit(2); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

// splash
{
  const S = sheet("splash"), shapes = S.shapes.slice(1);   // [0] is the background
  const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: "splash" });
  await page.waitForSelector('[data-screen="splash"] .hero'); await settle(page);
  compare("splash", "hero circle", shapeOf(shapes[8]), (await boxOf(page, ".hero"))[0] ?? NAN4);
  const tiles = await boxOf(page, ".tile");
  for (let i = 0; i < 8; i++) compare("splash", `tile ${i + 1}`, shapeOf(shapes[i]), tiles[i] ?? NAN4);
  compare("splash", "CTA start", shapeOf(shapes[9]), (await boxOf(page, '[data-testid="start"]'))[0] ?? NAN4);
  compare("splash", "CTA restore", shapeOf(shapes[10]), (await boxOf(page, '[data-testid="restore"]'))[0] ?? NAN4);
  const T = S.lines, line = (sel) => linesOf(page, sel);
  const textRow = (name, exp, act) => textCompare("splash", name, exp, act);
  const h1 = await line(".copy h1"), p = await line(".copy p");
  textRow("h1 line 1", T[0], h1[0]); textRow("h1 line 2", T[1], h1[1]); textRow("sub line", T[2], p[0]);
  textRow("start label", T[3], (await line('[data-testid="start"] span'))[0]);
  textRow("restore label", T[4], (await line('[data-testid="restore"] span'))[0]);
  const arr = (await line('[data-testid="arrive"]'))[0];
  textRow("arrive link", T[5], arr);
  const ul = S.shapes[S.shapes.length - 1];    // the underline: from the link's first to last letter
  compare("splash", "arrive underline x,width", [ul.x, ul.w], arr ? [arr[0], arr[1] - arr[0]] : [NaN, NaN]);
  compare("splash", "h1 line count", [2], [h1.length]);
  await fonts(page, "splash", [["h1", ".copy h1"], ["sub", ".copy p"], ["start label", '[data-testid="start"] span']]);
  await overflowAt(page, "splash", 390);
  await ctx.close();
  await widths(browser, PREVIEW + "/", "splash", '[data-screen="splash"]');
  await shot(browser, PREVIEW + "/", "splash", { wait: '[data-screen="splash"] .hero', screen: "splash" });
}

// splash-lang: a fresh device (nothing in localStorage) gets the list first
{
  const S = sheet("splash-lang"), shapes = S.shapes.slice(1);
  const { ctx, page } = await open(browser, PREVIEW + "/", 390, { asked: false, screen: "splash-lang" });
  await page.waitForSelector('[data-state="lang"]'); await settle(page);
  compare("splash-lang", "brand mark", shapeOf(shapes[0]), (await boxOf(page, ".lang-head .mark"))[0] ?? NAN4);
  const rowsBox = await boxOf(page, ".lang-list button");
  for (let i = 0; i < 8; i++) compare("splash-lang", `row ${i + 1}`, shapeOf(shapes[1 + i]), rowsBox[i] ?? NAN4);
  const gaps = rowsBox.slice(1).map((b, i) => b[1] - (rowsBox[i][1] + rowsBox[i][3]));
  compare("splash-lang", `row gap (max over ${rowsBox.length} rows)`, [8], [gaps.length ? gaps.reduce((a, g) => (Math.abs(g - 8) > Math.abs(a - 8) ? g : a), gaps[0]) : NaN]);
  const T = S.lines, line = (sel) => linesOf(page, sel);
  const textRow = (name, exp, act) => textCompare("splash-lang", name, exp, act);
  textRow("brand word", T[0], (await line(".lang-head .word"))[0]);
  textRow("title", T[1], (await line(".lang-copy h1"))[0]);
  textRow("hint", T[2], (await line(".lang-copy p"))[0]);
  for (let i = 0; i < 8; i++) textRow(`row ${i + 1} label`, T[3 + i], (await linesOf(page, `.lang-list li:nth-child(${i + 1}) button span`))[0]);
  const labels = await page.evaluate(() => [...document.querySelectorAll(".lang-list button")].map((b) => `${b.lang}:${b.textContent}`).join(" "));
  notes.push({ bad: false, text: `splash-lang rows in the app (${rowsBox.length}): ${labels}` });
  await fonts(page, "splash-lang", [["title", ".lang-copy h1"], ["row 1", ".lang-list li:nth-child(1) button span"]]);
  await overflowAt(page, "splash-lang", 390);
  await ctx.close();
  await widths(browser, PREVIEW + "/", "splash-lang", '[data-state="lang"]', { asked: false });
  await shot(browser, PREVIEW + "/", "splash-lang", { asked: false, wait: '[data-state="lang"]', screen: "splash-lang" });
}

// loading: the dev server's ?boot=<ms> holds the boot; the screen shows after 300 ms
{
  const S = sheet("loading"), shapes = S.shapes.slice(1);
  const url = DEV + "/?boot=60000";
  const { ctx, page } = await open(browser, url, 390, { screen: "loading" });
  await page.waitForSelector('[data-screen="loading"]'); await settle(page);
  compare("loading", "circle", shapeOf(shapes[0]), (await boxOf(page, ".circle"))[0] ?? NAN4);
  compare("loading", "ring", shapeOf(shapes[1]), (await boxOf(page, ".ring"))[0] ?? NAN4);
  const t = S.lines[0], l = (await linesOf(page, '[data-testid="loading"]'))[0];
  textCompare("loading", "caption", t, l);
  await fonts(page, "loading", [["caption", '[data-testid="loading"]']]);
  await overflowAt(page, "loading", 390);
  await ctx.close();
  await widths(browser, url, "loading", '[data-screen="loading"]');
  await shot(browser, url, "loading", { wait: '[data-screen="loading"]', screen: "loading" });
}

// ── register-1..3 and the registration's walk, against a node that is a stub ──
// The page's calls to the node never leave the browser: every fetch to a node path is answered by this stub
// (and the network the page sits on has no way out anyway). The stub keeps the share the page sent at
// POST /identities and hands it back at POST /vault/share, as the node does.
const NODE_PATH = /^\/(identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|sessions|away)(\/|$)/;
const DOCS = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
function nodeStub(opts = {}) {
  const calls = []; let share = null, pinAuth = null, left = 10, closed = false, misses = 0, soon = opts.soon ?? 0;
  // The feed the stub answers: { status, items, next } — a walk changes it between taps; the default is an empty page.
  const feed = { status: 200, items: [], next: null, hidden: new Set() };
  // The move's windows by lookup id, as the node keeps them (transfer.ts): the old device's invite, the new one's claim, the reply.
  const moves = new Map();
  // A step away: until when (seconds), or null; GET /identities/me says it.
  const away = { until: null };
  const prepare = async (ctx) => {
    // The sheets show the paper code K7QM 2XWD PL4R 9FTE (an L is not in the alphabet: E stands in, of about its width): the first 16 random bytes asked (the page's paper code, the first
    // thing it draws) are those characters' places in the alphabet; every later call is the real generator.
    await ctx.addInitScript(() => {
      const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ", want = "K7QM2XWDPE4R9FTE";
      const real = crypto.getRandomValues.bind(crypto); let used = false;
      crypto.getRandomValues = (a) => {
        if (!used && a instanceof Uint8Array && a.length === 16) { used = true; for (let i = 0; i < 16; i++) a[i] = alphabet.indexOf(want[i]); return a; }
        return real(a);
      };
    });
    await ctx.route("**/*", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
      const key = `${req.method()} ${u.pathname}`; calls.push(key);
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (key === "GET /legal/manifest") return opts.noManifest ? json(503, {}) : json(200, { documents: DOCS });
      if (key === "POST /identities") {
        if (opts.refuse) return json(opts.refuse, { error: "refused" });
        share = JSON.parse(req.postData()).share; pinAuth = null; left = 10; closed = false;   // a new identity: a new counter
        return json(200, { identity_id: "id-stub", session_id: "sess-stub" });
      }
      if (key === "POST /vault/share") {
        // The registration's own call sets the PIN's proof; after it the stub is the node's counter (relay pin_attempts.ts):
        // a miss is 409 pin_mismatch with attempts_left, the tenth 409 pin_locked and closed for good, a right PIN resets ten.
        const auth = JSON.parse(req.postData() ?? "{}").auth;
        if (pinAuth === null) { pinAuth = auth; return json(200, { share }); }
        if (closed) return json(409, { error: { code: "pin_locked", message: "closed", attempts_left: 0 } });
        if (soon > 0) { soon = 0; return route.fulfill({ status: 429, contentType: "application/json", headers: { "retry-after": "7" }, body: JSON.stringify({ error: { code: "rate_limited", attempts_left: left } }) }); }
        if (auth !== pinAuth) {
          misses++; left--;
          if (left === 0) { closed = true; return json(409, { error: { code: "pin_locked", message: "closed", attempts_left: 0 } }); }
          return json(409, { error: { code: "pin_mismatch", message: "no", attempts_left: left } });
        }
        left = 10; return json(200, { share });
      }
      if (key === "GET /feed") return json(feed.status, feed.status === 200 ? { items: feed.items.filter((c) => !feed.hidden.has(c.id)), next: feed.next } : { error: { code: "boom" } });
      if (key === "POST /hidden") { const id = JSON.parse(req.postData()).feed; feed.hidden.add(id); return json(200, { id: `h-${id}` }); }
      if (req.method() === "DELETE" && u.pathname.startsWith("/hidden/")) { feed.hidden.delete(decodeURIComponent(u.pathname.slice(8)).replace(/^h-/, "")); return route.fulfill({ status: 204 }); }
      if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
      if (key === "GET /identities/me") return json(200, { identity_id: "id-stub", ...(away.until ? { stepped_away_until: away.until } : {}) });
      if (key === "DELETE /away") { away.until = null; return route.fulfill({ status: 204 }); }
      // the arriving device's first PIN: a new share and a new proof (relay vault.ts init); the next /vault/share sets the proof
      if (key === "POST /vault/init") { share = JSON.parse(req.postData()).share; pinAuth = null; left = 10; closed = false; return json(200, {}); }
      if (key === "POST /sessions/invite") { moves.set(JSON.parse(req.postData()).lookup_id, { state: "waiting" }); return json(200, { expires_in: 120 }); }
      if (key === "POST /sessions/claim") {
        const b = JSON.parse(req.postData()), m = moves.get(b.lookup_id);
        if (!m || m.state !== "waiting") return json(404, { error: { code: "not_found" } });
        m.state = "claimed"; m.claim_envelope = b.envelope; return json(200, {});
      }
      const mv = /^\/sessions\/([^/]+)(\/(approve|reject|ack))?$/.exec(u.pathname);
      if (mv) {
        const m = moves.get(decodeURIComponent(mv[1]));
        if (!m) return json(404, { error: { code: "not_found" } });
        if (req.method() === "GET") return json(200, { state: m.state, ...(m.state === "claimed" ? { claim_envelope: m.claim_envelope } : {}), ...(m.state === "approved" ? { reply_envelope: m.reply, session_id: "sess-moved" } : {}) });
        if (mv[3] === "approve") { m.state = "approved"; m.reply = JSON.parse(req.postData()).reply; return json(200, { state: "approved", session_id: "sess-moved" }); }
        if (mv[3] === "reject") { m.state = "rejected"; return json(200, {}); }
        if (mv[3] === "ack") return json(200, {});
      }
      if (key === "POST /legal/accept") return json(200, {});
      calls.push(`UNEXPECTED ${key}`); return route.abort();
    });
  };
  return { calls, prepare, feed, away, moves, state: () => ({ left, closed, misses }) };
}
// Walks the page to a register step; `filled` leaves the first screen as the sheet draws it.
async function walk(page, step, { name = "Alex", age = "32", pin = "123456", again = pin } = {}) {
  await page.waitForSelector('[data-testid="start"]'); await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-screen="register-1"]');
  await page.fill('[data-testid="name"]', name); await page.fill('[data-testid="age"]', age); await page.check(".reg-check input");
  if (step === 1) return;
  await page.click('[data-testid="next"]'); await page.waitForSelector('[data-screen="register-2"]');
  await page.fill('[data-testid="pin"]', pin); await page.fill('[data-testid="pin-again"]', again);
  if (step === 2) return;
  await page.click('[data-testid="register"]'); await page.waitForSelector('[data-screen="register-3"]', { timeout: 90000 });
}
const lineAt = async (page, sel, i = 0) => (await linesOf(page, sel))[i];
const note = (ok, text) => notes.push({ bad: !ok, text });
const text = (page, sel) => page.locator(sel).first().innerText().catch(() => "(missing)");
// a shape drawn with transparency (the plate's cells): not in readSheet's list, read the same way
function shaded(file) {
  const svg = readFileSync(file, "utf8");
  const [, w] = svg.match(/<svg[^>]* width="([\d.]+)"/), vb = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/);
  const k = Number(w) / Number(vb[1]), out = [];
  for (const m of svg.slice(svg.indexOf("</defs>")).matchAll(/<path fill-rule="(?:nonzero|evenodd)" fill="[^"]+" fill-opacity="(0\.\d+)" d="([^"]+)"/g)) {
    const n = (m[2].match(/-?\d+(?:\.\d+)?/g) || []).map(Number), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    out.push([Math.min(...xs) * k, Math.min(...ys) * k, (Math.max(...xs) - Math.min(...xs)) * k, (Math.max(...ys) - Math.min(...ys)) * k]);
  }
  return out;
}
const head = async (page, scr, S, shapes, lines) => {
  compare(scr, "mark", shapeOf(shapes[0]), (await boxOf(page, ".reg-mark"))[0] ?? NAN4);
  const bars = await boxOf(page, ".reg-bars span");
  for (let i = 0; i < 3; i++) compare(scr, `bar ${i + 1}`, shapeOf(shapes[1 + i]), bars[i] ?? NAN4);
  const panel = (await boxOf(page, ".reg-sheet"))[0] ?? NAN4;
  compare(scr, "sheet left,top", [shapes[4].x, shapes[4].y], [panel[0], panel[1]]);
  textCompare(scr, "step words", lines[0], await lineAt(page, ".reg-step"));
  textCompare(scr, "title", lines[1], await lineAt(page, ".reg-body h1"));
  textCompare(scr, "sub line 1", lines[2], await lineAt(page, ".reg-sub", 0));
};
const regFonts = (page, scr) => fonts(page, scr, [["title", ".reg-body h1"], ["sub", ".reg-sub"], ["step words", ".reg-step"], ["button", ".reg-foot .cta span"]]);
const regWidths = async (browser, scr, step, stub) => {
  for (const w of [834, 1440]) {
    const o = await open(browser, PREVIEW + "/", w, { screen: scr, prepare: stub.prepare });
    await walk(o.page, step); await settle(o.page); await overflowAt(o.page, scr, w); await o.ctx.close();
  }
};

// register-1: the first screen filled as the sheet has it (Alex, 32, consent given), with the manifest's three links
{
  const S = regSheet(1), sh = S.shapes.slice(1), stub = nodeStub();
  const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: "register-1", prepare: stub.prepare });
  await walk(page, 1); await page.waitForSelector('[data-testid="legal-links"]'); await settle(page);
  await head(page, "register-1", S, sh, S.lines);
  const T = S.lines, scr = "register-1", row = (n, e, a) => textCompare(scr, n, e, a);
  row("sub line 2", T[3], await lineAt(page, ".reg-sub", 1));
  const inputs = await boxOf(page, ".reg-input");
  compare(scr, "name field", shapeOf(sh[5]), inputs[0] ?? NAN4); compare(scr, "age field", shapeOf(sh[6]), inputs[1] ?? NAN4);
  compare(scr, "consent box", shapeOf(sh[7]), (await boxOf(page, ".reg-box"))[0] ?? NAN4);
  const chips = await boxOf(page, ".reg-docs a");
  for (let i = 0; i < 3; i++) compare(scr, `chip ${i + 1}`, shapeOf(sh[8 + i]), chips[i] ?? NAN4);
  compare(scr, "next button", shapeOf(sh[11]), (await boxOf(page, '[data-testid="next"]'))[0] ?? NAN4);
  row("name label", T[4], await lineAt(page, ".reg-body > .reg-field:nth-of-type(1) label"));
  row("counter", T[6], await lineAt(page, '[data-testid="register-left"]'));
  row("age label", T[7], await lineAt(page, ".reg-body > .reg-field:nth-of-type(2) label"));
  row("age hint", T[9], await lineAt(page, '[data-testid="register-age-min"]'));
  row("consent words", T[10], await lineAt(page, ".reg-check > span:last-child"));
  row("chip 1 word", T[11], await lineAt(page, ".reg-docs li:nth-child(1) a span"));
  row("next label", T[12], await lineAt(page, '[data-testid="next"] span'));
  compare(scr, "text line count (sub)", [2], [(await linesOf(page, ".reg-sub")).length]);
  const counter = await text(page, '[data-testid="register-left"]');
  note(GEOMETRY ? counter === "20 of 24 left" : /20/.test(counter) && /24/.test(counter), `register-1 counter reads "${counter}" (sheet, in English: 20 of 24 left)`);
  await regFonts(page, "register-1"); await overflowAt(page, "register-1", 390);
  if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/register-1.png` });
  await ctx.close();
  await regWidths(browser, "register-1", 1, stub);
}
// register-2: the PIN twice (123456, as the sheet) and the easy-PIN notice
{
  const S = regSheet(2), sh = S.shapes.slice(1), stub = nodeStub(), scr = "register-2";
  const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: scr, prepare: stub.prepare });
  await walk(page, 2); await page.waitForSelector(".reg-notice"); await settle(page);
  await head(page, scr, S, sh, S.lines);
  const cells = await boxOf(page, ".reg-cell"), dots = await boxOf(page, ".reg-cell i");
  for (let i = 0; i < 12; i++) { compare(scr, `cell ${i + 1}`, shapeOf(sh[5 + 2 * i]), cells[i] ?? NAN4); compare(scr, `dot ${i + 1}`, shapeOf(sh[6 + 2 * i]), dots[i] ?? NAN4); }
  compare(scr, "easy-PIN notice", shapeOf(sh[29]), (await boxOf(page, ".reg-notice"))[0] ?? NAN4);
  compare(scr, "create button", shapeOf(sh[30]), (await boxOf(page, '[data-testid="register"]'))[0] ?? NAN4);
  textCompare(scr, "PIN label", S.lines[3], await lineAt(page, ".reg-body > .reg-field:nth-of-type(1) label"));
  textCompare(scr, "repeat label", S.lines[4], await lineAt(page, ".reg-body > .reg-field:nth-of-type(2) label"));
  textCompare(scr, "notice line 1", S.lines[5], await lineAt(page, ".reg-notice span", 0));
  textCompare(scr, "notice line 2", S.lines[6], await lineAt(page, ".reg-notice span", 1));
  textCompare(scr, "create label", S.lines[7], await lineAt(page, '[data-testid="register"] span'));
  await regFonts(page, scr); await overflowAt(page, scr, 390);
  if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/register-2.png` });
  await ctx.close();
  await regWidths(browser, scr, 2, stub);
}
// register-3: the plate, group 2 typed, group 4 three letters in (the fourth cell has the caret)
{
  const S = regSheet(3), sh = S.shapes.slice(1), stub = nodeStub(), scr = "register-3", shades = shaded(`${SHEETS}/w1_register-3.svg`);
  const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: scr, prepare: stub.prepare });
  await walk(page, 3);
  const gi = page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill("2XWD"); await gi.nth(1).fill("9FT"); await settle(page);
  await head(page, scr, S, sh, S.lines);
  textCompare(scr, "sub line 2", S.lines[3], await lineAt(page, ".reg-sub", 1));
  compare(scr, "plate", shapeOf(sh[5]), (await boxOf(page, ".reg-plate"))[0] ?? NAN4);
  const pc = await boxOf(page, ".reg-plate-groups span");
  for (let i = 0; i < 4; i++) compare(scr, `plate group ${i + 1}`, shades[i] ?? NAN4, pc[i] ?? NAN4);
  const cells = await boxOf(page, ".reg-cells .reg-cell");
  for (let i = 0; i < 8; i++) compare(scr, `type cell ${i + 1}`, shapeOf(sh[6 + i]), cells[i] ?? NAN4);
  compare(scr, "done button (the sheet draws it dimmed: the create button's place)", shapeOf(regSheet(2).shapes.slice(1)[30]), (await boxOf(page, '[data-testid="confirm"]'))[0] ?? NAN4);
  textCompare(scr, "plate head", S.lines[4], await lineAt(page, ".reg-plate-head span"));
  textCompare(scr, "plate row 1 (K7QM, 2XWD)", S.lines[5], await lineAt(page, '[data-testid="paper-code"]', 0));
  textCompare(scr, "plate row 2 (PL4R, 9FTE)", S.lines[6], await lineAt(page, '[data-testid="paper-code"]', 1));
  textCompare(scr, "plate note", S.lines[7], await lineAt(page, '[data-testid="paper-say"]'));
  textCompare(scr, "type group 2 label", S.lines[8], await lineAt(page, '[data-testid="paper-groups"] .reg-field:nth-child(1) label'));
  textCompare(scr, "type group 4 label", S.lines[10], await lineAt(page, '[data-testid="paper-groups"] .reg-field:nth-child(2) label'));
  const ring = await page.evaluate(() => { const a = document.querySelector(".reg-cells:focus-within .reg-cell[data-active]"); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left, r.top, r.width, r.height, getComputedStyle(a).boxShadow]; });
  compare(scr, "caret ring (4th cell of group 4)", shapeOf(sh[13]), ring ? ring.slice(0, 4) : NAN4);
  note(!!ring && /inset/.test(ring[4]) && (await page.textContent('[data-testid="paper-code"]')) === "K7QM 2XWD PE4R 9FTE", `register-3 paper-code textContent "${await page.textContent('[data-testid="paper-code"]')}", caret ring ${ring ? ring[4] : "none"}`);
  note((await page.getAttribute('[data-testid="confirm"]', "aria-disabled")) === "true", "register-3 done is aria-disabled while group 4 has 3 of 4 letters");
  await regFonts(page, scr); await overflowAt(page, scr, 390);
  if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/register-3.png` });
  await ctx.close();
  await regWidths(browser, scr, 3, stub);
}

// ── the registration as a person walks it (stubbed node; the same in en and ru, words read from the page) ──
{
  const calls = (s) => s.calls.join(", ");
  // A. the whole way: three steps, the groups typed back, the feed; the node saw the registration, the share, the confirmation, three accepts
  let stub = nodeStub();
  let o = await open(browser, PREVIEW + "/", 390, { screen: "walk-happy", prepare: stub.prepare });
  await walk(o.page, 3);
  const gi = o.page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill("2xwd"); await gi.nth(1).fill("9-fte");
  await o.page.click('[data-testid="confirm"]');
  await o.page.waitForSelector('[data-screen="feed"]', { timeout: 20000 }).catch(() => null);
  const happy = ["GET /legal/manifest", "POST /identities", "POST /vault/share", "POST /recovery/confirm"].every((c) => stub.calls.includes(c)) && stub.calls.filter((c) => c === "POST /legal/accept").length === 3 && !stub.calls.some((c) => c.startsWith("UNEXPECTED"));
  note(happy && (await o.page.locator('[data-screen="feed"]').count()) === 1 && new URL(o.page.url()).pathname === "/feed", `walk: three steps, groups typed back in other case and with a dash, then the feed at /feed; node saw: ${calls(stub)}`);
  await o.ctx.close();
  // B. the address limit: 429 says what to do, stays on step 2, nothing else is called
  stub = nodeStub({ refuse: 429 }); o = await open(browser, PREVIEW + "/", 390, { screen: "walk-429", prepare: stub.prepare });
  await walk(o.page, 2); await o.page.click('[data-testid="register"]'); await o.page.waitForSelector('[data-testid="error"]');
  const err429 = await text(o.page, '[data-testid="error"]');
  note(err429.length > 20 && !err429.includes("429") && (await o.page.locator('[data-screen="register-2"]').count()) === 1 && !stub.calls.includes("POST /vault/share"), `walk: 429 says "${err429.slice(0, 70)}…", stays on step 2, no vault call`);
  await o.ctx.close();
  // B2. another status says its number
  stub = nodeStub({ refuse: 503 }); o = await open(browser, PREVIEW + "/", 390, { screen: "walk-503", prepare: stub.prepare });
  await walk(o.page, 2); await o.page.click('[data-testid="register"]'); await o.page.waitForSelector('[data-testid="error"]');
  note((await text(o.page, '[data-testid="error"]')).includes("503"), `walk: 503 says its number: "${(await text(o.page, '[data-testid="error"]')).slice(0, 70)}"`);
  await o.ctx.close();
  // C. wrong groups: the mismatch line, the node is not asked to confirm
  stub = nodeStub(); o = await open(browser, PREVIEW + "/", 390, { screen: "walk-wrong", prepare: stub.prepare });
  await walk(o.page, 3);
  const g2 = o.page.locator('[data-testid="paper-groups"] input');
  await g2.nth(0).fill("2XWD"); await g2.nth(1).fill("9FTX"); await o.page.click('[data-testid="confirm"]');
  await o.page.waitForSelector('[data-testid="error"]');
  note(!stub.calls.includes("POST /recovery/confirm") && (await o.page.locator('[data-screen="register-3"]').count()) === 1, `walk: wrong group says "${(await text(o.page, '[data-testid="error"]')).slice(0, 60)}…" and /recovery/confirm is not called`);
  await o.ctx.close();
  // D. step one's gates: each missing thing is said, in the order name, age, young, consent; a press shows it as an alert
  stub = nodeStub(); o = await open(browser, PREVIEW + "/", 390, { screen: "walk-gates", prepare: stub.prepare });
  await o.page.waitForSelector('[data-testid="start"]'); await o.page.click('[data-testid="start"]'); await o.page.waitForSelector('[data-screen="register-1"]');
  // aria-disabled reads as "not enabled" to Playwright: a person can press it, so it is pressed by force
  const reason = async () => { await o.page.click('[data-testid="next"]', { force: true }); return await text(o.page, ".reg-reason"); };
  const r1 = await reason(); await o.page.fill('[data-testid="name"]', "Alex");
  const r2 = await reason(); await o.page.fill('[data-testid="age"]', "12");
  const r3 = await reason(); await o.page.fill('[data-testid="age"]', "32");
  const r4 = await reason(); const alert = await o.page.locator(".reg-reason[role=alert]").count(); await o.page.check(".reg-check input");
  const open_ = await o.page.getAttribute('[data-testid="next"]', "aria-disabled");
  note(new Set([r1, r2, r3, r4]).size === 4 && alert === 1 && open_ === null && (await o.page.inputValue('[data-testid="age"]')) === "32", `walk: gates say four different things (${[r1, r2, r3, r4].map((r) => `"${r.slice(0, 28)}"`).join(", ")}), a press makes it an alert, consent opens "next"`);
  await o.page.fill('[data-testid="age"]', "1a2b3c4"); note((await o.page.inputValue('[data-testid="age"]')) === "123", "walk: age keeps digits only, three at most (1a2b3c4 -> 123)");
  await o.ctx.close();
  // E. the PIN pair: easy warns, a hard one does not, two different ones say so and keep "create" shut
  stub = nodeStub(); o = await open(browser, PREVIEW + "/", 390, { screen: "walk-pin", prepare: stub.prepare });
  await walk(o.page, 2, { pin: "123456" });
  const easy = await o.page.locator(".reg-notice").count();
  await o.page.fill('[data-testid="pin"]', "483915"); await o.page.fill('[data-testid="pin-again"]', "483916");
  const differ = await o.page.locator(".reg-error").count(), shut = await o.page.getAttribute('[data-testid="register"]', "aria-disabled");
  await o.page.fill('[data-testid="pin-again"]', "483915");
  note(easy === 1 && (await o.page.locator(".reg-notice").count()) === 0 && differ === 1 && shut === "true" && (await o.page.getAttribute('[data-testid="register"]', "aria-disabled")) === null, "walk: 123456 warns and does not stop; 483915 does not warn; 483915 vs 483916 says they differ and keeps create shut");
  await o.ctx.close();
  // F. no manifest (503): no links, the consent alone, the walk still goes on and nothing is accepted
  stub = nodeStub({ noManifest: true }); o = await open(browser, PREVIEW + "/", 390, { screen: "walk-nomanifest", prepare: stub.prepare });
  await walk(o.page, 3);
  const g3 = o.page.locator('[data-testid="paper-groups"] input'); await g3.nth(0).fill("2XWD"); await g3.nth(1).fill("9FTE");
  await o.page.click('[data-testid="confirm"]'); await o.page.waitForSelector('[data-screen="feed"]', { timeout: 20000 }).catch(() => null);
  note(!stub.calls.includes("POST /legal/accept") && stub.calls.includes("POST /recovery/confirm"), `walk: with no manifest nothing is accepted and the walk ends (node saw: ${calls(stub)})`);
  await o.ctx.close();
}

// ── unlock and locked: the identity kept on this disk, the PIN after a reload, the lock ──
// One browser context is one origin's storage: pages of it share IndexedDB (the record) and the stub's state, and a
// new page is a new tab (its own sessionStorage: no reload grace). The stub plays the node's PIN counter (ten, then closed).
const PIN = "483915";
const PREVIEW_SWITCH = process.env.SWITCH_URL ?? "http://localhost:4175";
const adopt = (page, screen) => {
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) csp.push(`${screen} console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => csp.push(`${screen} pageerror: ${String(e).slice(0, 200)}`));
};
const feedSel = '[data-screen="feed"]';
async function registerFull(page, pin = PIN) {   // the splash to the feed, the way a person goes
  await walk(page, 3, { pin });
  const gi = page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill("2XWD"); await gi.nth(1).fill("9FTE");
  await page.click('[data-testid="confirm"]');
  await page.waitForSelector(feedSel, { timeout: 20000 });
}
const shares = (stub) => stub.calls.filter((c) => c === "POST /vault/share").length;
const stored = (page) => page.evaluate(() => new Promise((resolve) => {   // what the disk holds: database, version, stores, the record's fields
  const r = indexedDB.open("xor-vault");
  r.onerror = () => resolve(null);
  r.onsuccess = () => {
    const db = r.result, out = { version: db.version, stores: [...db.objectStoreNames] };
    if (!out.stores.includes("identity")) return resolve(out);
    const g = db.transaction("identity").objectStore("identity").get("me");
    g.onsuccess = () => { out.fields = g.result ? Object.keys(g.result).sort() : null; out.unlockKeyExtractable = g.result?.unlockKey?.extractable; resolve(out); };
    g.onerror = () => resolve(out);
  };
}));
const newTab = async (ctx, url, screen) => { const p = await ctx.newPage(); adopt(p, screen); await p.goto(url); return p; };
// The words are the dictionary's in the language of the run: English is read whole, any other language by its number.
const hasLeft = (line, n) => (RU ? new RegExp(`(^|\\D)${n}(\\D|$)`).test(line) : line.includes(`Attempts left: ${n}`));
const shut = (page, testid) => page.getAttribute(`[data-testid="${testid}"]`, "aria-disabled");

// A. the whole life of the record: registered → on disk → reload inside the grace (no PIN, no node call) → a new tab asks the PIN
{
  const stub = nodeStub();
  const o = await open(browser, PREVIEW + "/", 390, { screen: "walk-keep", prepare: stub.prepare });
  await registerFull(o.page);
  const disk = await stored(o.page);
  note(!!disk && disk.version === 2 && disk.stores.join() === "grace,identity" && disk.fields?.join() === ["deviceSalt", "id", "identityId", "longSpki", "savedAt", "sealedLong", "sealedWrap", "sessionId", "unlockKey", "unlockSpki", "wrapCheck", "wrapSpki", "wrappedLongKey"].sort().join() && disk.unlockKeyExtractable === false,
    `walk: after registration the disk holds IndexedDB "xor-vault" v${disk?.version}, stores ${disk?.stores}, record fields ${disk?.fields}, unlock key extractable=${disk?.unlockKeyExtractable} (the web's scheme)`);
  const before = shares(stub);
  await o.page.reload(); await o.page.waitForSelector(`${feedSel}, [data-screen="unlock"]`, { timeout: 20000 });
  const graced = (await o.page.locator('[data-screen="unlock"]').count()) === 0 && (await o.page.locator(feedSel).count()) === 1;
  note(graced && shares(stub) === before && new URL(o.page.url()).pathname === "/feed", `walk: reload inside the grace goes straight to the feed (/feed), no PIN asked, no call to the node (POST /vault/share ${before} -> ${shares(stub)})`);
  // a new tab has no grace: the PIN
  const t = await newTab(o.ctx, PREVIEW + "/", "walk-keep"); await t.waitForSelector('[data-screen="unlock"]', { timeout: 20000 });
  note(new URL(t.url()).pathname === "/unlock", `walk: a new tab on "/" opens the PIN screen at ${new URL(t.url()).pathname}`);
  await t.fill('[data-testid="unlock-pin"]', "111111"); await t.click('[data-testid="unlock"]'); await t.waitForSelector('[data-testid="error"]');
  note(hasLeft(await text(t, '[data-testid="error"]'), 9) && (await t.inputValue('[data-testid="unlock-pin"]')) === "", `walk: a wrong PIN says "${await text(t, '[data-testid="error"]')}" and clears the field`);
  await t.fill('[data-testid="unlock-pin"]', PIN); await t.click('[data-testid="unlock"]');
  await t.waitForSelector(feedSel, { timeout: 20000 });
  note(shares(stub) === before + 2 && new URL(t.url()).pathname === "/feed" && stub.state().left === 10, `walk: the right PIN opens the sealed record and lands on the feed (/feed); the node saw ${shares(stub) - before} proofs (one wrong, one right) and its counter is back to ${stub.state().left}`);
  await o.ctx.close();
}

// B. wrong PIN until the node closes entry: the attempts counted down in the node's words, the last three warn, the tenth closes
{
  const stub = nodeStub();
  const o = await open(browser, PREVIEW + "/", 390, { screen: "walk-closed", prepare: stub.prepare });
  await registerFull(o.page);
  const t = await newTab(o.ctx, PREVIEW + "/", "walk-closed"); await t.waitForSelector('[data-screen="unlock"]', { timeout: 20000 });
  const seen = [];
  for (let i = 1; i <= 10; i++) {
    await t.fill('[data-testid="unlock-pin"]', "000000"); await t.click('[data-testid="unlock"]');
    while (stub.state().misses < i) await new Promise((r) => setTimeout(r, 50));   // the node has counted it
    await t.locator('[data-testid="unlock"]:not([aria-busy])').waitFor({ timeout: 20000 }); await t.locator('[data-testid="error"]').waitFor({ timeout: 20000 });
    seen.push(await text(t, '[data-testid="error"]'));
  }
  const closed = seen[9], third = seen[6], fourth = seen[5];
  note(hasLeft(seen[0], 9) && hasLeft(fourth, 4) && hasLeft(third, 3) && hasLeft(seen[8], 1) && (RU ? third.length > fourth.length + 20 : !fourth.includes("paper code") && third.includes("After that, entry on this device closes until the paper code.")),
    `walk: misses count down in the node's words (1st "${seen[0]}", 6th "${fourth}", 7th "${third}", 9th "${seen[8]}")`);
  const calls = shares(stub);
  await t.click('[data-testid="unlock"]', { force: true }); await t.waitForTimeout(300);
  note((RU ? !/\d/.test(closed) && closed !== seen[8] : closed === "Entry is closed until the paper code.") && (await shut(t, "unlock")) === "true" && shares(stub) === calls && (await t.locator('[data-testid="unlock-restore"]').count()) === 1,
    `walk: the tenth miss says "${closed}", Open is aria-disabled and sends nothing (POST /vault/share ${calls} -> ${shares(stub)}), the paper code button is there`);
  // the paper code is the way out, as the web has it
  await t.click('[data-testid="unlock-restore"]'); await t.waitForSelector('[data-screen="restore"]');
  note(new URL(t.url()).pathname === "/restore", `walk: "Paper code" leads to /restore`);
  await o.ctx.close();
}

// C. too soon: the node's 429 says how long; the PIN was not checked, so no attempts are named
{
  const stub = nodeStub({ soon: 1 });
  const o = await open(browser, PREVIEW + "/", 390, { screen: "walk-soon", prepare: stub.prepare });
  await registerFull(o.page);
  const t = await newTab(o.ctx, PREVIEW + "/", "walk-soon"); await t.waitForSelector('[data-screen="unlock"]', { timeout: 20000 });
  await t.fill('[data-testid="unlock-pin"]', "000000"); await t.click('[data-testid="unlock"]'); await t.waitForSelector('[data-testid="error"]');
  const line = await text(t, '[data-testid="error"]');
  note((RU ? /(^|\D)7(\D|$)/.test(line) : line === "Too soon after the last attempt. Try again in 7 s.") && stub.state().left === 10, `walk: a 429 says "${line}" and spends nothing (counter ${stub.state().left})`);
  await o.ctx.close();
}

// D. forget: this device lets the identity go; the next tab opens on the splash
{
  const stub = nodeStub();
  const o = await open(browser, PREVIEW + "/", 390, { screen: "walk-forget", prepare: stub.prepare });
  await registerFull(o.page);
  const t = await newTab(o.ctx, PREVIEW + "/", "walk-forget"); await t.waitForSelector('[data-screen="unlock"]', { timeout: 20000 });
  // The first tap only asks: still the unlock screen, the link now says what a second tap does.
  await t.click('[data-testid="forget"]'); await t.waitForSelector('[data-testid="forget-sure"]');
  if (!(await t.$('[data-screen="unlock"]'))) throw new Error("walk-forget: one tap left the unlock screen — it must only ask");
  await t.click('[data-testid="forget-sure"]'); await t.waitForSelector('[data-screen="splash"]');
  const t2 = await newTab(o.ctx, PREVIEW + "/unlock", "walk-forget"); await t2.waitForSelector('[data-screen="splash"]', { timeout: 20000 });
  note((await stored(t2))?.fields === null, "walk: «forget» removes the record from the disk; /unlock then opens the splash");
  await o.ctx.close();
}

// E. the unlock sheet: a returning visitor, three misses (7 left), four digits typed again
{
  const S = readSheet(`${SHEETS}/w2_unlock.svg`), sh = S.shapes.slice(1), stub = nodeStub(), scr = "unlock";
  const o = await open(browser, PREVIEW + "/", 390, { screen: scr, prepare: stub.prepare });
  await registerFull(o.page);
  const t = await newTab(o.ctx, PREVIEW + "/", scr); await t.waitForSelector('[data-screen="unlock"]', { timeout: 20000 });
  for (let i = 0; i < 3; i++) {
    await t.fill('[data-testid="unlock-pin"]', "000000"); await t.click('[data-testid="unlock"]');
    while (stub.state().misses < i + 1) await new Promise((r) => setTimeout(r, 50));   // the node has counted it
    await t.locator('[data-testid="unlock"]:not([aria-busy])').waitFor({ timeout: 20000 }); await t.locator('[data-testid="error"]').waitFor({ timeout: 20000 });
  }
  await t.fill('[data-testid="unlock-pin"]', "1234"); await settle(t);
  compare(scr, "mark", shapeOf(sh[0]), (await boxOf(t, ".reg-mark"))[0] ?? NAN4);
  const cells = await boxOf(t, ".reg-cell"), dots = await boxOf(t, ".reg-cell i");
  const cellIdx = [1, 3, 5, 7, 9, 11], dotIdx = [2, 4, 6, 8];
  cellIdx.forEach((s, i) => compare(scr, `cell ${i + 1}`, shapeOf(sh[s]), cells[i] ?? NAN4));
  dotIdx.forEach((s, i) => compare(scr, `dot ${i + 1}`, shapeOf(sh[s]), dots[i] ?? NAN4));
  const ring = await t.evaluate(() => { const a = document.querySelector(".reg-cells:focus-within .reg-cell[data-active]"); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  compare(scr, "caret ring (5th cell)", shapeOf(sh[10]), ring ?? NAN4);
  compare(scr, "error box", shapeOf(sh[12]), (await boxOf(t, ".gate-error"))[0] ?? NAN4);
  compare(scr, "open button", shapeOf(sh[13]), (await boxOf(t, '[data-testid="unlock"]'))[0] ?? NAN4);
  compare(scr, "paper code button", shapeOf(sh[14]), (await boxOf(t, '[data-testid="unlock-restore"]'))[0] ?? NAN4);
  const row = (n, e, a) => textCompare(scr, n, e, a);
  row("title", S.lines[0], await lineAt(t, ".gate-body h1"));
  row("sub line", S.lines[1], await lineAt(t, ".reg-sub"));
  row("PIN label", S.lines[2], await lineAt(t, ".reg-field label"));
  row("error text", S.lines[3], await lineAt(t, ".gate-error span"));
  row("open label", S.lines[4], await lineAt(t, '[data-testid="unlock"] span'));
  row("paper code label", S.lines[5], await lineAt(t, '[data-testid="unlock-restore"] span'));
  compare(scr, "title line count", [1], [(await linesOf(t, ".gate-body h1")).length]);
  await fonts(t, scr, [["title", ".gate-body h1"], ["sub", ".reg-sub"], ["button", ".gate-foot .cta span"], ["error", ".gate-error span"]]); await overflowAt(t, scr, 390);
  if (GEOMETRY) await t.screenshot({ path: `${SHOTS}/unlock.png` });
  await o.ctx.close();
  for (const w of [834, 1440]) {   // the column keeps the phone's width on wider screens
    const s2 = nodeStub(), o2 = await open(browser, PREVIEW + "/", w, { screen: scr, prepare: s2.prepare });
    await registerFull(o2.page);
    const t2 = await newTab(o2.ctx, PREVIEW + "/", scr); await t2.waitForSelector('[data-screen="unlock"]'); await settle(t2); await overflowAt(t2, scr, w); await o2.ctx.close();
  }
}

// F. the stand's waits (VITE_STAND on the dev server: sessionStorage "xor-grace-ms", "xor-idle-ms"): a reload after the grace asks the PIN;
//    the idle lock draws the locked sheet; its PIN opens it where it was; a reload while locked asks the PIN again
{
  const standInit = (graceMs, idleMs) => async (ctx) => { await ctx.addInitScript(([g, i]) => { sessionStorage.setItem("xor-grace-ms", String(g)); sessionStorage.setItem("xor-idle-ms", String(i)); }, [graceMs, idleMs]); };
  // F1. grace 1.5 s: waiting it out, a reload asks the PIN
  let stub = nodeStub(); const prep = (g, i) => async (ctx, page) => { await standInit(g, i)(ctx); await stub.prepare(ctx, page); };
  let o = await open(browser, DEV + "/", 390, { screen: "walk-grace", prepare: prep(1500, 300000) });
  await registerFull(o.page); await o.page.waitForTimeout(2500);
  const before = shares(stub);
  await o.page.reload(); await o.page.waitForSelector(`${feedSel}, [data-screen="unlock"]`, { timeout: 20000 });
  note((await o.page.locator('[data-screen="unlock"]').count()) === 1 && shares(stub) === before, `walk: a reload after the grace (1.5 s, the stand's) asks the PIN, nothing sent to the node before it is typed`);
  await o.ctx.close();
  // F2. idle 1.5 s: the lock
  stub = nodeStub(); const scr = "locked", S = readSheet(`${SHEETS}/w2_locked.svg`), sh = S.shapes.slice(1);
  o = await open(browser, DEV + "/", 390, { screen: "walk-lock", prepare: prep(30000, 1500) });
  await registerFull(o.page);
  await o.page.waitForSelector('[data-screen="locked"]', { timeout: 20000 }); await settle(o.page);
  compare(scr, "lock circle", shapeOf(sh[0]), (await boxOf(o.page, ".lock-circle"))[0] ?? NAN4);
  const cells = await boxOf(o.page, ".reg-cell");
  [1, 3, 4, 5, 6, 7].forEach((s, i) => compare(scr, `cell ${i + 1}`, shapeOf(sh[s]), cells[i] ?? NAN4));
  const ring = await o.page.evaluate(() => { const a = document.querySelector(".reg-cells:focus-within .reg-cell[data-active]"); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  compare(scr, "caret ring (1st cell)", shapeOf(sh[2]), ring ?? NAN4);
  compare(scr, "open button", shapeOf(sh[8]), (await boxOf(o.page, '[data-testid="lock-go"]'))[0] ?? NAN4);
  const row = (n, e, a) => textCompare(scr, n, e, a);
  row("title", S.lines[0], await lineAt(o.page, ".gate-body h1"));
  row("sub line", S.lines[1], await lineAt(o.page, ".reg-sub"));
  row("PIN label", S.lines[2], await lineAt(o.page, ".reg-field label"));
  row("open label", S.lines[3], await lineAt(o.page, '[data-testid="lock-go"] span'));
  compare(scr, "title line count", [1], [(await linesOf(o.page, ".gate-body h1")).length]);
  await fonts(o.page, scr, [["title", ".gate-body h1"], ["sub", ".reg-sub"], ["button", ".gate-foot .cta span"]]); await overflowAt(o.page, scr, 390);
  if (GEOMETRY) await o.page.screenshot({ path: `${SHOTS}/locked.png` });
  note((await o.page.locator(".gate-body > *").count()) === (await o.page.locator(".gate-body > .lock-circle, .gate-body > h1, .gate-body > .reg-sub, .gate-body > .reg-field, .gate-body > .gate-foot").count()), "walk: the locked page is the lock, the words, the PIN and Open — no name, no counts, no feed behind it");
  // a wrong PIN, then the right one: back on the feed, where it was
  await o.page.fill('[data-testid="lock-pin"]', "000000"); await o.page.click('[data-testid="lock-go"]'); await o.page.waitForSelector('[data-testid="error"]');
  const miss = await text(o.page, '[data-testid="error"]');
  await o.page.fill('[data-testid="lock-pin"]', PIN); await o.page.click('[data-testid="lock-go"]'); await o.page.waitForSelector(feedSel, { timeout: 20000 });
  note(hasLeft(miss, 9) && new URL(o.page.url()).pathname === "/feed", `walk: the lock's wrong PIN says "${miss}"; the right one returns to the feed without a reload`);
  // locked again (idle), then a reload: the PIN, not the grace (the lock dropped it)
  await o.page.waitForSelector('[data-screen="locked"]', { timeout: 20000 });
  await o.page.reload(); await o.page.waitForSelector('[data-screen="unlock"], ' + feedSel, { timeout: 20000 });
  note((await o.page.locator('[data-screen="unlock"]').count()) === 1, "walk: a reload while locked asks the PIN (the lock dropped the grace)");
  await o.ctx.close();
  // F3. 429 on the lock: a timer with the node's seconds
  stub = nodeStub({ soon: 1 });
  o = await open(browser, DEV + "/", 390, { screen: "walk-lock-soon", prepare: prep(30000, 1500) });
  await registerFull(o.page); await o.page.waitForSelector('[data-screen="locked"]', { timeout: 20000 });
  await o.page.fill('[data-testid="lock-pin"]', "000000"); await o.page.click('[data-testid="lock-go"]'); await o.page.waitForSelector('[data-testid="locked-timer"]');
  const timer = await text(o.page, '[data-testid="locked-timer"]');
  note(/^00:0[5-7]$/.test(timer) && (RU || (await text(o.page, '[data-testid="error"]')).startsWith("Too soon")), `walk: the lock's "too soon" shows the node's wait as a timer (${timer})`);
  await o.ctx.close();
  for (const w of [834, 1440]) {
    stub = nodeStub(); const o2 = await open(browser, DEV + "/", w, { screen: scr, prepare: prep(30000, 1500) });
    await registerFull(o2.page); await o2.page.waitForSelector('[data-screen="locked"]', { timeout: 20000 }); await settle(o2.page); await overflowAt(o2.page, scr, w); await o2.ctx.close();
  }
}

// H. the feed and the card, against a node that answers GET /feed from a list the walk sets (stub.feed)
{
  const phrase = (n, extra = {}) => ({ id: `ph-${n}`, text: `Walk phrase number ${n}`, mode: "walk", lang: "en", like_count: n, ...extra });
  const offer = { id: "of-1", kind: "offer", text: "Offer coffee for two", mode: "coffee", lang: "en", like_count: 2, offer: { discount_value: "20%", conditions: "Weekdays", venue_name: "Cafe" } };
  const sit = async (stub, scr) => {   // register, land on the feed with the stub's list as set
    const o = await open(browser, PREVIEW + "/", 390, { screen: scr, prepare: stub.prepare });
    await registerFull(o.page);
    return o;
  };
  const cardsOf = (page) => page.locator('[data-testid="cards"] [data-testid="card"]');
  // H1. three phrases and an offer: four cards, the offer marked, nothing in the console
  {
    const stub = nodeStub(); stub.feed.items = [phrase(1), phrase(2), phrase(3), offer];
    const o = await sit(stub, "walk-feed");
    await o.page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 }).catch(() => null);
    await settle(o.page);
    const n = await cardsOf(o.page).count(), offers = await o.page.locator('[data-testid="cards"] [data-testid="offer"]').count();
    note(n === 4 && offers === 1 && (await o.page.locator('[data-testid="quiet"], [data-testid="error"]').count()) === 0 && stub.calls.includes("GET /feed"), `walk: the feed draws ${n} cards for 3 phrases and 1 offer (${offers} marked as an offer), no "quiet", no error`);
    if (GEOMETRY) await o.page.screenshot({ path: `${SHOTS}/feed.png` });
    await overflowAt(o.page, "feed", 390);
    await o.ctx.close();
  }
  // H2. an empty page: quiet, and a wider circle to go to
  {
    const stub = nodeStub();
    const o = await sit(stub, "walk-feed-empty");
    await o.page.waitForSelector('[data-testid="quiet"]', { timeout: 20000 }).catch(() => null);
    note((await o.page.locator('[data-testid="quiet"]').isVisible()) && (await o.page.locator('[data-testid="wider"]').isVisible()) && (await cardsOf(o.page).count()) === 0, "walk: an empty page says the quiet and offers the wider circle; no cards");
    await o.page.click('[data-testid="wider"]'); await o.page.locator('[data-testid="radius-3000"][aria-pressed="true"]').waitFor({ timeout: 10000 }).catch(() => null);
    note((await o.page.getAttribute('[data-testid="radius-3000"]', "aria-pressed")) === "true", "walk: «wider» moves the radius from 1 km to 3 km");
    await o.ctx.close();
  }
  // H3. the node answers 500: the error and a retry; the retry with 200 draws the cards
  {
    const stub = nodeStub(); stub.feed.status = 500; stub.feed.items = [phrase(1), phrase(2)];
    const o = await sit(stub, "walk-feed-error");
    await o.page.waitForSelector('[data-testid="error"]', { timeout: 20000 }).catch(() => null);
    const shown = (await o.page.locator('[data-testid="error"]').isVisible()) && (await o.page.locator('[data-testid="retry"]').isVisible()) && (await cardsOf(o.page).count()) === 0;
    stub.feed.status = 200;
    await o.page.click('[data-testid="retry"]'); await o.page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 }).catch(() => null);
    note(shown && (await cardsOf(o.page).count()) === 2 && (await o.page.locator('[data-testid="error"]').count()) === 0, "walk: a 500 shows the error with retry and no cards; retry with 200 draws the 2 cards and drops the error");
    await o.ctx.close();
  }
  // H4. a card: open, read, the «…» sheet, hide, bring back
  {
    const stub = nodeStub(); stub.feed.items = [phrase(1), phrase(2), phrase(3)];
    const o = await sit(stub, "walk-card");
    await o.page.waitForSelector('[data-testid="cards"] [data-testid="card"]', { timeout: 20000 });
    await o.page.locator('[data-testid="card"] .fd-open').nth(1).click();
    await o.page.waitForSelector('[data-screen="card"]'); await settle(o.page);
    const vis = async (sel) => o.page.locator(sel).first().isVisible();
    const txt = await text(o.page, '[data-screen="card"] [data-testid="text"]');
    note(txt === "Walk phrase number 2" && (await vis('[data-screen="card"] [data-testid="mode"]')) && (await vis('[data-screen="card"] [data-testid="like"]')), `walk: a tap opens the card: text "${txt}", mode and «I'm in» visible`);
    if (GEOMETRY) await o.page.screenshot({ path: `${SHOTS}/card.png` });
    await o.page.click('[data-testid="more-menu"]'); await o.page.waitForSelector('[data-testid="card-more"]'); await settle(o.page);
    if (GEOMETRY) await o.page.screenshot({ path: `${SHOTS}/card-more.png` });
    note((await vis('[data-testid="hide"]')) && (await vis('[data-testid="notice"]')) && (await vis('[data-testid="block"]')), "walk: «…» opens a sheet with hide, notice and block");
    await o.page.click('[data-testid="hide"]'); await o.page.waitForSelector('[data-testid="gone"][data-why="hidden"]', { timeout: 10000 }).catch(() => null);
    const left = await cardsOf(o.page).count();
    note((await vis('[data-testid="gone"][data-why="hidden"]')) && (await vis('[data-testid="hidden-undo"]')) && left === 2 && stub.calls.includes("POST /hidden") && (await o.page.locator('[data-screen="card"]').count()) === 0, `walk: hide leaves "hidden · return" on the feed and ${left} of 3 cards (POST /hidden sent)`);
    if (GEOMETRY) await o.page.screenshot({ path: `${SHOTS}/feed-hidden.png` });
    await o.page.click('[data-testid="hidden-undo"]'); await o.page.locator('[data-testid="cards"] [data-testid="card"]').nth(2).waitFor({ timeout: 10000 }).catch(() => null);   // not waitForFunction: Playwright compiles its predicate with eval in the page, which the CSP forbids (violation noise)
    note((await cardsOf(o.page).count()) === 3 && (await o.page.locator('[data-testid="gone"]').count()) === 0 && stub.calls.includes("DELETE /hidden/h-ph-2"), "walk: «return» brings the phrase back: 3 cards again, the note gone (DELETE /hidden/<handle> sent)");
    await o.ctx.close();
  }
}

// ── the move (w2_departure-start/-code/-claimed/-done, w2_arrival-code/-check/-pin) and the step away (w2_away) ──
// Two devices, one stub: device A (registered) opens /move, device B (a fresh browser context) types A's code. The stub
// relays between them as the node does (relay/node/src/routes/transfer.ts): invite, claim, state, approve, ack.
{
  const stub = nodeStub();
  const dev = (S) => S.shapes.slice(1);   // [0] is the background
  const sheetOf = (n) => sheet(n);
  const textRows = (scr, page, pairs) => Promise.all(pairs.map(async ([name, exp, sel, i = 0]) => textCompare(scr, name, exp, await lineAt(page, sel, i))));
  const boxes = (scr, name, exp, act) => exp.forEach((e, i) => compare(scr, `${name} ${i + 1}`, shapeOf(e), act[i] ?? NAN4));
  const shotOf = async (page, name) => { if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
  const toMove = (page) => page.evaluate(() => { history.pushState({ gate: "departure", i: 1 }, "", "/move"); dispatchEvent(new PopStateEvent("popstate")); });

  // A: registered, then the address /move
  const A = await open(browser, PREVIEW + "/", 390, { screen: "departure-start", prepare: stub.prepare });
  await registerFull(A.page);
  await toMove(A.page); await A.page.waitForSelector('[data-screen="departure"][data-state="start"]');
  await A.page.fill('[data-testid="move-pin"]', PIN); await A.page.locator('[data-testid="move-pin"]').blur(); await settle(A.page);
  {
    const S = sheetOf("departure-start"), sh = dev(S), T = S.lines, scr = "departure-start";
    compare(scr, "price box", shapeOf(sh[1]), (await boxOf(A.page, ".mv-warn"))[0] ?? NAN4);
    const cells = await boxOf(A.page, ".reg-cell"), dots = await boxOf(A.page, ".reg-cell i");
    boxes(scr, "cell", [2, 4, 6, 8, 10, 12].map((i) => sh[i]), cells);
    boxes(scr, "dot", [3, 5, 7, 9, 11, 13].map((i) => sh[i]), dots);
    compare(scr, "get code button", shapeOf(sh[14]), (await boxOf(A.page, '[data-testid="move-go"]'))[0] ?? NAN4);
    await textRows(scr, A.page, [["bar title", T[0], ".mv-title"], ["price title", T[1], ".mv-warn-title"],
      ["price line 1", T[2], ".mv-warn-title + p", 0], ["price line 2", T[3], ".mv-warn-title + p", 1], ["price line 3", T[4], ".mv-warn-title + p", 2], ["price line 4", T[5], ".mv-warn-title + p", 3],
      ["PIN label", T[6], ".mv-pin label"], ["button label", T[7], '[data-testid="move-go"] span']]);
    compare(scr, "price line count", [4], [(await linesOf(A.page, ".mv-warn-title + p")).length]);
    await fonts(A.page, scr, [["bar", ".mv-title"], ["price", ".mv-warn-title + p"], ["button", '[data-testid="move-go"] span']]); await overflowAt(A.page, scr, 390);
    await shotOf(A.page, scr);
  }
  await A.page.click('[data-testid="move-go"]');
  await A.page.waitForSelector('[data-screen="departure"][data-state="waiting"] [data-testid="move-code"]', { timeout: 60000 }); await settle(A.page);
  const code = (await A.page.getAttribute('[data-testid="move-code"]', "aria-label")).replaceAll(" ", "");
  {
    const S = sheetOf("departure-code"), sh = dev(S), T = S.lines, scr = "departure-code";
    boxes(scr, "code cell", sh.slice(1, 10), await boxOf(A.page, '[data-testid="move-code"] .mv-char'));
    compare(scr, "stop button", shapeOf(sh[11]), (await boxOf(A.page, '[data-testid="move-stop"]'))[0] ?? NAN4);
    await textRows(scr, A.page, [["bar title", T[0], ".mv-title"], ["title", T[1], ".mv-body h1"], ["life words", T[5], '[data-testid="move-life"]'],
      ["ring minutes", T[6], ".mv-ring > span"], ["stop label", T[7], '[data-testid="move-stop"] span']]);
    note(/^[0-9A-Z]{9}$/.test(code) && stub.calls.includes("POST /sessions/invite"), `walk: move — the PIN's proof opened the invite (POST /sessions/invite), nine characters shown (${code.length})`);
    await fonts(A.page, scr, [["title", ".mv-body h1"], ["code", '[data-testid="move-code"] .mv-char']]); await overflowAt(A.page, scr, 390);
    await shotOf(A.page, scr);
  }

  // B: a fresh device, the splash's "arrive", six of the nine typed (the sheet's caret on the seventh)
  const B = await open(browser, PREVIEW + "/", 390, { screen: "arrival-code", prepare: stub.prepare });
  await B.page.waitForSelector('[data-testid="arrive"]'); await B.page.click('[data-testid="arrive"]');
  await B.page.waitForSelector('[data-screen="arrival"][data-state="code"]');
  await B.page.fill('[data-testid="arrive-code"]', code.slice(0, 6)); await settle(B.page);
  {
    const S = sheetOf("arrival-code"), sh = dev(S), T = S.lines, scr = "arrival-code";
    boxes(scr, "cell", [1, 2, 3, 4, 5, 6, 7, 9, 10].map((i) => sh[i]), await boxOf(B.page, ".reg-cell"));
    const ring = await B.page.evaluate(() => { const a = document.querySelector(".reg-cells:focus-within .reg-cell[data-active]"); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    compare(scr, "caret ring (7th cell)", shapeOf(sh[8]), ring ?? NAN4);
    compare(scr, "next button", shapeOf(sh[11]), (await boxOf(B.page, '[data-testid="arrive-go"]'))[0] ?? NAN4);
    await textRows(scr, B.page, [["bar title", T[0], ".mv-title"], ["title", T[1], ".mv-body h1"], ["sub line 1", T[2], ".mv-sub", 0], ["sub line 2", T[3], ".mv-sub", 1],
      ["next label", T[6], '[data-testid="arrive-go"] span']]);
    note((await B.page.getAttribute('[data-testid="arrive-go"]', "aria-disabled")) === "true", "walk: move in — «next» is shut with six of nine characters");
    await fonts(B.page, scr, [["title", ".mv-body h1"], ["sub", ".mv-sub"]]); await overflowAt(B.page, scr, 390);
    await shotOf(B.page, scr);
  }
  await B.page.fill('[data-testid="arrive-code"]', `${code.slice(0, 3)}-${code.slice(3, 6)} ${code.slice(6).toLowerCase()}`);
  await B.page.click('[data-testid="arrive-go"]');
  await B.page.waitForSelector('[data-screen="arrival"][data-state="claimed"] [data-testid="arrive-check"]', { timeout: 60000 }); await settle(B.page);
  {
    const S = sheetOf("arrival-check"), sh = dev(S), T = S.lines, scr = "arrival-check";
    boxes(scr, "check cell", sh.slice(1, 5), await boxOf(B.page, '[data-testid="arrive-check"] .mv-char'));
    compare(scr, "waiting ring", shapeOf(sh[5]), (await boxOf(B.page, ".mv-wait"))[0] ?? NAN4);
    await textRows(scr, B.page, [["bar title", T[0], ".mv-title"], ["title", T[1], ".mv-body h1"], ["sub line 1", T[2], ".mv-sub", 0], ["sub line 2", T[3], ".mv-sub", 1],
      ["waiting words", T[5], ".mv-waiting"]]);
    note(stub.calls.includes("POST /sessions/claim"), "walk: move in — the code typed with a dash, a space and in lower case is claimed (POST /sessions/claim)");
    await fonts(B.page, scr, [["title", ".mv-body h1"], ["waiting", ".mv-waiting"]]); await overflowAt(B.page, scr, 390);
    await shotOf(B.page, scr);
  }

  // A: somebody claimed — who, when, the four characters
  await A.page.waitForSelector('[data-screen="departure"][data-state="claimed"] [data-testid="move-yes"]', { timeout: 30000 }); await settle(A.page);
  const checkA = await A.page.getAttribute('[data-testid="move-check"]', "aria-label"), checkB = await B.page.getAttribute('[data-testid="arrive-check"]', "aria-label");
  {
    const S = sheetOf("departure-claimed"), sh = dev(S), T = S.lines, scr = "departure-claimed";
    compare(scr, "who card", shapeOf(sh[1]), (await boxOf(A.page, ".mv-who"))[0] ?? NAN4);
    compare(scr, "who mark", shapeOf(sh[2]), (await boxOf(A.page, ".mv-avatar"))[0] ?? NAN4);
    boxes(scr, "check cell", sh.slice(3, 7), await boxOf(A.page, '[data-testid="move-check"] .mv-char'));
    compare(scr, "yes button", shapeOf(sh[7]), (await boxOf(A.page, '[data-testid="move-yes"]'))[0] ?? NAN4);
    compare(scr, "no button", shapeOf(sh[8]), (await boxOf(A.page, '[data-testid="move-no"]'))[0] ?? NAN4);
    await textRows(scr, A.page, [["bar title", T[0], ".mv-title"], ["title", T[1], ".mv-body h1"], ["sub line 1", T[2], ".mv-sub", 0], ["sub line 2", T[3], ".mv-sub", 1],
      ["mark letter", T[4], ".mv-avatar"], ["name", T[5], '[data-testid="move-label"]'], ["when", T[6], ".mv-who-when"],
      ["yes label", T[8], '[data-testid="move-yes"] span'], ["no label", T[9], '[data-testid="move-no"] span']]);
    note(!!checkA && checkA === checkB, `walk: move — the old device shows the same four characters as the new one (${checkA} / ${checkB})`);
    await fonts(A.page, scr, [["title", ".mv-body h1"], ["name", '[data-testid="move-label"]']]); await overflowAt(A.page, scr, 390);
    await shotOf(A.page, scr);
  }
  await A.page.click('[data-testid="move-yes"]');
  await A.page.waitForSelector('[data-screen="departure"][data-state="approved"] [data-testid="move-exit"]', { timeout: 30000 }); await settle(A.page);
  {
    const S = sheetOf("departure-done"), sh = dev(S), T = S.lines, scr = "departure-done";
    compare(scr, "circle", shapeOf(sh[1]), (await boxOf(A.page, ".mv-circle"))[0] ?? NAN4);
    compare(scr, "to the start button", shapeOf(sh[2]), (await boxOf(A.page, '[data-testid="move-exit"]'))[0] ?? NAN4);
    await textRows(scr, A.page, [["bar title", T[0], ".mv-title"], ["title", T[1], ".mv-body h1"], ["words line 1", T[2], '[data-testid="move-done"]', 0],
      ["words line 2", T[3], '[data-testid="move-done"]', 1], ["button label", T[4], '[data-testid="move-exit"] span']]);
    await fonts(A.page, scr, [["title", ".mv-body h1"], ["words", '[data-testid="move-done"]']]); await overflowAt(A.page, scr, 390);
    await shotOf(A.page, scr);
  }

  // B: approved — the first PIN, the second field two digits in (the sheet's caret on the third)
  await B.page.waitForSelector('[data-screen="arrival"][data-state="approved"] [data-testid="arrive-pin"]', { timeout: 30000 });
  await B.page.fill('[data-testid="arrive-pin"]', PIN); await B.page.fill('[data-testid="arrive-pin-again"]', PIN.slice(0, 2)); await settle(B.page);
  {
    const S = sheetOf("arrival-pin"), sh = dev(S), T = S.lines, scr = "arrival-pin";
    compare(scr, "confirmed box", shapeOf(sh[1]), (await boxOf(B.page, ".mv-ok"))[0] ?? NAN4);
    const cells = await boxOf(B.page, ".reg-cell"), dots = await boxOf(B.page, ".reg-cell i");
    boxes(scr, "cell", [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 21, 22].map((i) => sh[i]), cells);
    boxes(scr, "dot", [3, 5, 7, 9, 11, 13, 15, 17].map((i) => sh[i]), dots);
    const ring = await B.page.evaluate(() => { const a = document.querySelector(".reg-cells:focus-within .reg-cell[data-active]"); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
    compare(scr, "caret ring (repeat, 3rd cell)", shapeOf(sh[19]), ring ?? NAN4);
    compare(scr, "done button", shapeOf(sh[23]), (await boxOf(B.page, '[data-testid="arrive-keep"]'))[0] ?? NAN4);
    await textRows(scr, B.page, [["bar title", T[0], ".mv-title"], ["confirmed words", T[1], ".mv-ok span"], ["new PIN label", T[2], ".mv-body > .mv-pin:nth-child(2) label"],
      ["repeat label", T[3], ".mv-body > .mv-pin:nth-child(3) label"], ["done label", T[4], '[data-testid="arrive-keep"] span']]);
    await fonts(B.page, scr, [["confirmed", ".mv-ok span"], ["label", ".mv-pin label"]]); await overflowAt(B.page, scr, 390);
    await shotOf(B.page, scr);
  }
  await B.page.fill('[data-testid="arrive-pin-again"]', PIN); await B.page.click('[data-testid="arrive-keep"]');
  await B.page.waitForSelector(feedSel, { timeout: 60000 }).catch(() => null);
  const diskB = await stored(B.page);
  note((await B.page.locator(feedSel).count()) === 1 && stub.calls.includes("POST /vault/init") && stub.calls.some((c) => /^POST \/sessions\/.+\/ack$/.test(c)) && diskB?.fields?.includes("sealedLong") && diskB?.fields?.includes("sessionSpki"),
    `walk: move in — the first PIN seals the arrived identity on this disk (fields ${diskB?.fields}) and lands on the feed; node saw /vault/init and the ack`);
  // A: «To the start» forgets the identity here
  await A.page.click('[data-testid="move-exit"]'); await A.page.waitForSelector('[data-screen="splash"]', { timeout: 20000 }).catch(() => null);
  note((await A.page.locator('[data-screen="splash"]').count()) === 1 && (await stored(A.page))?.fields === null, "walk: move — «To the start» on the old device forgets the identity and opens the splash");
  note(!stub.calls.some((c) => c.startsWith("UNEXPECTED")), `walk: move — no call the stub does not know (${stub.calls.filter((c) => c.startsWith("UNEXPECTED")).join(", ") || "none"})`);
  await A.ctx.close(); await B.ctx.close();
  for (const w of [834, 1440]) {   // the column keeps the phone's width on wider screens
    const s2 = nodeStub(), o2 = await open(browser, PREVIEW + "/", w, { screen: "departure-start", prepare: s2.prepare });
    await registerFull(o2.page); await toMove(o2.page); await o2.page.waitForSelector('[data-screen="departure"]'); await settle(o2.page); await overflowAt(o2.page, "departure-start", w); await o2.ctx.close();
  }

  // a refusal: a code that does not match says so and stays
  {
    const s3 = nodeStub(), o3 = await open(browser, PREVIEW + "/arrival", 390, { screen: "walk-move-bad", prepare: s3.prepare });
    await o3.page.waitForSelector('[data-testid="arrive-code"]'); await o3.page.fill('[data-testid="arrive-code"]', "ABCDEFGHJ"); await o3.page.click('[data-testid="arrive-go"]');
    await o3.page.waitForSelector('[data-testid="error"]', { timeout: 60000 }).catch(() => null);
    note((await text(o3.page, '[data-testid="error"]')).length > 10 && (await o3.page.locator('[data-state="code"]').count()) === 1, `walk: move in — an unknown code says "${(await text(o3.page, '[data-testid="error"]')).slice(0, 60)}" and stays on the code`);
    await o3.ctx.close();
  }
}

// the step away: the profile says until when (15:40 on the sheet, set so in the page's clock); «Come back» asks DELETE /away
{
  const stub = nodeStub(), S = sheet("away"), sh = S.shapes.slice(1), T = S.lines, scr = "away";
  const o = await open(browser, PREVIEW + "/", 390, { screen: scr, prepare: stub.prepare });
  await registerFull(o.page);
  stub.away.until = await o.page.evaluate(() => { const d = new Date(); d.setHours(15, 40, 0, 0); if (d.getTime() < Date.now() + 120000) d.setDate(d.getDate() + 1); return Math.floor(d.getTime() / 1000); });
  await o.page.reload(); await o.page.waitForSelector('[data-screen="away"]', { timeout: 20000 }); await settle(o.page);
  compare(scr, "circle", shapeOf(sh[1]), (await boxOf(o.page, ".mv-circle"))[0] ?? NAN4);
  const rowsBox = await boxOf(o.page, ".mv-rows div");
  for (let i = 0; i < 3; i++) compare(scr, `row ${i + 1} line (top, width)`, [sh[2 + i].x, sh[2 + i].y, sh[2 + i].w], rowsBox[i] ? [rowsBox[i][0], rowsBox[i][1], rowsBox[i][2]] : [NaN, NaN, NaN]);
  compare(scr, "come back button", shapeOf(sh[5]), (await boxOf(o.page, '[data-testid="away-return"]'))[0] ?? NAN4);
  const row = async (name, exp, sel, i = 0) => textCompare(scr, name, exp, await lineAt(o.page, sel, i));
  await row("brand word", T[0], ".mv-brand"); await row("title", T[1], ".mv-body h1");
  await row("words line 1", T[2], '[data-testid="away-line"]', 0); await row("words line 2", T[3], '[data-testid="away-line"]', 1);
  for (let i = 0; i < 3; i++) { await row(`row ${i + 1} name`, T[4 + 2 * i], `.mv-rows div:nth-child(${i + 1}) dt`); await row(`row ${i + 1} value`, T[5 + 2 * i], `.mv-rows div:nth-child(${i + 1}) dd`); }
  await row("button label", T[10], '[data-testid="away-return"] span');
  const until = await text(o.page, '[data-testid="away-until"]');
  note(GEOMETRY ? until === "15:40" : /15:40/.test(until), `walk: away — the profile's end reads "${until}" (the sheet: 15:40)`);
  await fonts(o.page, scr, [["title", ".mv-body h1"], ["rows", ".mv-rows dt"]]); await overflowAt(o.page, scr, 390);
  if (GEOMETRY) await o.page.screenshot({ path: `${SHOTS}/away.png` });
  await o.page.click('[data-testid="away-return"]'); await o.page.waitForSelector(feedSel, { timeout: 20000 }).catch(() => null);
  note((await o.page.locator(feedSel).count()) === 1 && stub.calls.includes("DELETE /away") && stub.away.until === null, "walk: away — «Come back» asks DELETE /away and opens the feed");
  await o.ctx.close();
  for (const w of [834, 1440]) {
    const s2 = nodeStub(), o2 = await open(browser, PREVIEW + "/", w, { screen: scr, prepare: s2.prepare });
    await registerFull(o2.page); s2.away.until = Math.floor(Date.now() / 1000) + 3600;
    await o2.page.reload(); await o2.page.waitForSelector('[data-screen="away"]', { timeout: 20000 }); await settle(o2.page); await overflowAt(o2.page, scr, w); await o2.ctx.close();
  }
}

// G. interop: one origin, the web's build and the app's build in turn (static-switch.mjs); the disk is the same
if (process.env.WEB_BUILT === "1") {
  const mode = async (m) => { await fetch(`${PREVIEW_SWITCH}/__mode/${m}`); };
  const urlOf = (p) => `${PREVIEW_SWITCH}${p}`;
  const webReg = async (page) => {   // the web's registration up to the paper code: the record is on the disk from "register"
    await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check('input[type="checkbox"]', { force: true });
    await page.click('[data-testid="next"]'); await page.waitForSelector('[data-testid="pin"]');
    await page.fill('[data-testid="pin"]', PIN); await page.fill('[data-testid="pin-again"]', PIN);
    await page.click('[data-testid="register"]'); await page.waitForSelector('[data-testid="paper-code"]', { timeout: 90000 });
  };
  const appReg = async (page) => {
    await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check(".reg-check input");
    await page.click('[data-testid="next"]'); await page.waitForSelector('[data-testid="pin"]');
    await page.fill('[data-testid="pin"]', PIN); await page.fill('[data-testid="pin-again"]', PIN);
    await page.click('[data-testid="register"]'); await page.waitForSelector('[data-testid="paper-code"]', { timeout: 90000 });
  };
  // web made it, the app opens it
  let stub = nodeStub();
  await mode("web");
  let o = await open(browser, urlOf("/register"), 390, { screen: "walk-interop", prepare: stub.prepare });
  await webReg(o.page); const webDisk = await stored(o.page);
  await mode("app");
  let t = await newTab(o.ctx, urlOf("/"), "walk-interop"); await t.waitForSelector('[data-screen="unlock"]', { timeout: 20000 });
  await t.fill('[data-testid="unlock-pin"]', PIN); await t.click('[data-testid="unlock"]'); await t.waitForSelector(feedSel, { timeout: 30000 }).catch(() => null);
  note((await t.locator(feedSel).count()) === 1 && shares(stub) === 2, `walk: INTEROP web -> app: an identity made by the web build (disk: v${webDisk?.version} ${webDisk?.stores}) opens in the app build with its PIN and lands on the feed (node saw ${shares(stub)} proofs)`);
  await o.ctx.close();
  // the app made it, the web opens it
  stub = nodeStub();
  await mode("app");
  o = await open(browser, urlOf("/register"), 390, { screen: "walk-interop", prepare: stub.prepare });
  await appReg(o.page);
  await mode("web");
  t = await newTab(o.ctx, urlOf("/"), "walk-interop"); await t.waitForSelector('[data-screen="unlock"]', { timeout: 20000 });
  await t.fill('[data-testid="unlock-pin"]', PIN); await t.click('[data-testid="unlock"]');
  const left = await t.waitForSelector('[data-screen="unlock"]', { state: "detached", timeout: 30000 }).then(() => true, () => false);
  note(left && shares(stub) === 2, `walk: INTEROP app -> web: an identity made by the app build opens in the web build with its PIN (the unlock screen is left, node saw ${shares(stub)} proofs)`);
  await mode("app");
  await o.ctx.close();
} else {
  notes.push({ bad: false, text: "walk: INTEROP web <-> app NOT VERIFIED here (the web build was skipped or failed: INTEROP=0 or its npm ci / vite build)" });
}

await browser.close();

// ── report ──
if (rows.length) {
const wName = Math.max(...rows.map((r) => r.name.length)), wExp = Math.max(...rows.map((r) => r.exp.length)), wAct = Math.max(...rows.map((r) => r.act.length));
console.log(`${"screen".padEnd(12)} ${"element".padEnd(wName)}  ${"expected".padEnd(wExp)}  ${"actual".padEnd(wAct)}  ${"delta".padEnd(20)} ok`);
console.log(`(box = left,top,width,height; text = left,baseline; px; locale ${LOCALE}; tolerance ${TOL} px)`);
for (const r of rows) console.log(`${r.screen.padEnd(12)} ${r.name.padEnd(wName)}  ${r.exp.padEnd(wExp)}  ${r.act.padEnd(wAct)}  ${r.delta.padEnd(20)} ${r.ok ? "ok" : "NO"}`);
}
if (widths_.length) console.log(`info   text widths (sheet ink vs app advance; words differ, see above): ${widths_.join("; ")}`);
for (const n of notes) console.log(`${n.bad ? "DEFECT" : "ok    "} ${n.text}`);
console.log(csp.length ? `DEFECT console/CSP errors (${csp.length}): ${[...new Set(csp)].slice(0, 8).join(" | ")}` : "ok     console/CSP errors: none (preview carries the CSP header and meta; dev has none)");
const good = rows.filter((r) => r.ok).length;
const clean = !notes.some((n) => n.bad) && !csp.length;
console.log(GEOMETRY ? `measure-app: ${good} of ${rows.length} within ${TOL}px` : `measure-app[${TAG}]: fonts, overflow, CSP ${clean ? "clean" : "DEFECTS"}`);
process.exit(good === rows.length && !notes.some((n) => n.bad) && !csp.length ? 0 : 1);
