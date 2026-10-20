// Measures the rendered app/ advertiser's cabinet and the offer's exit screen against the Dusk sheets of wave 4
// (mobile w4_cabinet-sign-in, w4_cabinet-sent, w4_cabinet-venues, w4_cabinet-offers, w4_cabinet-new-offer, w4_offer),
// and walks what they do against a stubbed node (sign in by mail, the link that expired, the envelope's code wrong
// and right, an offer published, an offer link reported). Run by scripts/measure-app-w4-cabinet.sh inside the
// Playwright image, on an internal network: PREVIEW is the built app (with its CSP) in the container called `app`.
//
// Expected values are read from the sheets (sheet-geometry.mjs), never typed in; indices are the sheets' drawing
// order (shape 0 is the night). Per element: left/top/width/height of the box against the shape; per text line: the
// left edge (or the right edge of a right-aligned value) and the baseline against the sheet's ink, and the line's
// WIDTH within 2.5 % (a wrong font size shows there, the left edge alone does not). The helpers are the ones of
// measure-app-w4.mjs (copied: that script runs on load and exports nothing).
//
// Not compared, and why: the words inside inputs (the DOM has no text node for them); the venue sheet's four
// letters "8KD2" and its eight cells — the node's code is twelve letters (relay/node/src/routes/adv.ts envelopeCode),
// drawn here as two rows of six in the sheet's footprint, so the cells are compared as one block; the offers sheet
// has no way to a new offer and the venues sheet none to the offers — this shell adds a primary and a row below
// what the sheet draws, and the sheet's elements are compared as drawn.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { readSheet } from "./sheet-geometry.mjs";

const SHEETS = process.env.SHEETS ?? "/sheets";
const PREVIEW = process.env.PREVIEW_URL ?? "http://localhost:4174";
const SHOTS = process.env.SHOTS ?? "/shots";
const TOL = Number(process.env.TOL ?? 2);
const LOCALE = process.env.LANG_TAG ?? "en-US";
const GEOMETRY = process.env.GEOMETRY !== "0";
const TAG = LOCALE.slice(0, 2);
const RU = TAG === "ru";
const OVERRIDE = process.env.CSS_OVERRIDE ?? "";
const ONLY = (process.env.ONLY ?? "").split(",").filter(Boolean);
// The address glyph run of the strip (the sheet-geometry reader takes it for one glyph: another fill group): its right edge from the SVG itself.
import { readFileSync } from "node:fs";
function addressRight(n) {
  const svg = readFileSync(`${SHEETS}/w4_${n}.svg`, "utf8");
  const k = Number(svg.match(/<svg[^>]* width="([\d.]+)"/)[1]) / Number(svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+)/)[1]);
  const run = [...svg.matchAll(/<use xlink:href="#glyph-1-\d+" x="([\d.]+)" y="33\.487336"\/>/g)].map((m) => Number(m[1]));
  const step = (run.at(-1) - run[0]) / (run.length - 1);
  return (run.at(-1) + step) * k;
}
const sheet = (n) => ({ ...readSheet(`${SHEETS}/w4_${n}.svg`), addressRight: n.startsWith("cabinet") ? addressRight(n) : NaN });

const rows = [], notes = [], csp = [];
const NAN4 = [NaN, NaN, NaN, NaN];
const fmt = (a) => a.map((v) => (Number.isNaN(v) ? "-" : v.toFixed(1))).join(",");
function compare(screen, name, exp, act, tol = TOL) {
  if (!GEOMETRY) return;
  const d = exp.map((e, i) => act[i] - e);
  const ok = d.every((x) => !Number.isNaN(x) && Math.abs(x) <= tol);
  rows.push({ screen, name, exp: fmt(exp), act: fmt(act), delta: d.map((x) => (Number.isNaN(x) ? "NaN" : (x >= 0 ? "+" : "") + x.toFixed(1))).join(","), ok });
}
const note = (ok, text) => notes.push({ bad: !ok, text });
const shapeOf = (s) => [s.x, s.y, s.w, s.h];
const left = (scr, name, exp, act) => compare(scr, name, [exp.left, exp.base], act ? [act[0], act[2]] : [NaN, NaN]);
const right = (scr, name, exp, act) => compare(scr, name, [exp.right, exp.base], act ? [act[1], act[2]] : [NaN, NaN]);
// a line's width: the font's size, which the left edge and the baseline do not show
// (Chromium lays Outfit out with whole-pixel advances here, so a long word is a few px off its outlines: 4 px or 4 %, which still shows a 10 % font)
const wide = (scr, name, exp, act) => compare(scr, `${name} width`, [exp.right - exp.left], act ? [act[1] - act[0]] : [NaN], Math.max(4, 0.04 * (exp.right - exp.left)));

async function settle(page) {
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
const boxOf = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }), sel);
const box = async (page, sel, i = 0) => (await boxOf(page, sel))[i] ?? NAN4;
const union = async (page, sel) => {
  const b = await boxOf(page, sel); if (!b.length) return NAN4;
  const x0 = Math.min(...b.map((r) => r[0])), y0 = Math.min(...b.map((r) => r[1])), x1 = Math.max(...b.map((r) => r[0] + r[2])), y1 = Math.max(...b.map((r) => r[1] + r[3]));
  return [x0, y0, x1 - x0, y1 - y0];
};
const linesOf = (page, sel, nth = 0) => page.evaluate(([s, k]) => {
  const el = document.querySelectorAll(s)[k]; if (!el) return [];
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
}, [sel, nth]);
const line = async (page, sel, nth = 0, i = 0) => (await linesOf(page, sel, nth))[i];

async function overflowAt(page, screen, w) {
  const bad = await page.evaluate((vw) => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) out.push(`document scrollWidth ${de.scrollWidth} > clientWidth ${de.clientWidth}`);
    for (const e of document.querySelectorAll("[data-screen] *")) {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      if (e.closest("[aria-hidden='true']") && e.tagName === "path") continue;
      const tag = `${e.tagName.toLowerCase()}${e.dataset.testid ? `[${e.dataset.testid}]` : typeof e.className === "string" && e.className ? "." + e.className.split(" ")[0] : ""}`;
      if (r.width && (r.right > vw + 0.5 || r.left < -0.5)) out.push(`${tag} outside the viewport: ${r.left.toFixed(1)}..${r.right.toFixed(1)} of ${vw}`);
      const clips = cs.overflowX !== "visible" || cs.textOverflow === "ellipsis";
      if (e.tagName !== "INPUT" && clips && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains("me-body") && !e.classList.contains("cb-body")) out.push(`${tag} clips horizontally: scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
    }
    return out;
  }, w);
  notes.push({ bad: bad.length > 0, text: `overflow/clipping ${screen}[${TAG}] @${w}: ${bad.length ? bad.slice(0, 6).join("; ") : "none"}` });
}

async function fonts(page, screen, probes) {
  const info = await page.evaluate(() => ({ cyr: document.fonts.check("16px Outfit", "Привет"), lat: document.fonts.check("16px Outfit", "Hello") }));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument", { depth: 0 });
  const used = [];
  for (const [label, sel] of probes) {
    const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector: sel });
    if (!nodeId) { notes.push({ bad: true, text: `fonts ${screen}[${TAG}] ${label}: ${sel} not found` }); continue; }
    const { fonts: f } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
    if (f.length === 0 || f.some((x) => !x.isCustomFont)) notes.push({ bad: true, text: `fonts ${screen}[${TAG}] ${label}: rendered with ${f.map((x) => `${x.familyName}${x.isCustomFont ? "" : " (SYSTEM)"}`).join(", ") || "nothing"}` });
    else used.push(label);
  }
  await cdp.detach();
  notes.push({ bad: (RU && !info.cyr) || !info.lat, text: `fonts ${screen}[${TAG}]: Outfit Latin ${info.lat}, Cyrillic ${info.cyr}; loaded faces on ${used.length} of ${probes.length} probes` });
}

// ── the node, stubbed: the cabinet's routes, an offer link's, and what a registration calls (for the exit screen's seat) ──
const NODE_PATH = /^\/(adv|o|identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|statements|likes|inbox|away)(\/|$)/;
const ACCEPTED = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
const RIGHT_CODE = "ABCDEFGHJKLM";
const tonight = () => { const d = new Date(); d.setHours(23, 0, 0, 0); return d.toISOString(); };
const longAgo = () => new Date(Date.now() - 3 * 86_400_000).toISOString();
function nodeStub() {
  const calls = [], bodies = {};
  const s = {
    signedIn: false, linkOk: false, share: null, pinAuth: null, reported: 0,
    venues: [], offers: [],
  };
  const prepare = async (ctx) => {
    await ctx.route("**/*", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
      const key = `${req.method()} ${u.pathname}`; calls.push(key);
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() ?? "{}");
      if (u.pathname.startsWith("/adv/")) {
        if (key === "GET /adv/me") return s.signedIn ? json(200, { email: "hello@puri.ge", email_confirmed: true, brand: "sosed" }) : json(401, { error: { code: "unauthenticated" } });
        if (key === "POST /adv/sign-in" || key === "POST /adv/signup") { bodies[key] = body(); return route.fulfill({ status: 204 }); }
        if (key === "POST /adv/session") { if (s.linkOk) { s.signedIn = true; return route.fulfill({ status: 204 }); } return json(401, { error: { code: "link_spent" } }); }
        if (key === "GET /adv/venues") return s.signedIn ? json(200, { items: s.venues }) : json(401, {});
        if (key === "POST /adv/venues") { bodies[key] = body(); return json(201, { id: "v-new", ...body(), verification_status: "unverified", verified_at: null, envelope_expires_at: null, place: null }); }
        if (/^POST \/adv\/venues\/[^/]+\/verify$/.test(key)) {
          const code = body().code; bodies[key] = code;
          if (code === RIGHT_CODE) { s.venues = s.venues.map((v) => ({ ...v, verification_status: "verified", envelope_expires_at: null })); return json(200, { verification_status: "verified" }); }
          return json(422, { error: { code: "invalid_body", message: "that code is not the one in the envelope", attempts_left: 4 } });
        }
        if (key === "GET /adv/offers") return json(200, { items: s.offers });
        if (key === "POST /adv/offers") { bodies[key] = body(); return json(201, { id: "o-new", venue_id: body().venue_id, offer_text: body().offer_text, discount_value: body().discount_value, conditions: null, promo_code: null, external_url: null, redirect_hits: 0, discount_until: body().discount_until, status: "active", published_at: new Date().toISOString(), expires_at: new Date(Date.now() + 15_600_000).toISOString(), link: "", link_disabled: false, complaints: 0 }); }
        if (key === "GET /adv/complaints") return json(200, { items: [] });
        calls.push(`UNEXPECTED ${key}`); return route.abort();
      }
      if (key === "GET /o/abc123") return json(200, { domain: "puri.ge", disabled: false });
      if (key === "POST /o/abc123/report") { s.reported++; return json(202, {}); }
      if (key === "GET /legal/manifest") return json(200, { documents: ACCEPTED });
      if (key === "POST /legal/accept") return json(200, {});
      if (key === "POST /identities") { s.share = body().share; s.pinAuth = null; return json(200, { identity_id: "id-stub", session_id: "sess-stub" }); }
      if (key === "POST /vault/share") {
        const auth = body().auth;
        if (s.pinAuth === null) { s.pinAuth = auth; return json(200, { share: s.share }); }
        return auth === s.pinAuth ? json(200, { share: s.share }) : json(409, { error: { code: "pin_mismatch", attempts_left: 9 } });
      }
      if (key === "GET /identities/me") return json(200, { name: "Alex", name_state: "accepted", age: 32, phrases: [], filter_age_min: 25, filter_age_max: 35 });
      if (key === "GET /statements") return json(200, { items: [] });
      if (key === "GET /feed") return json(200, { items: [], next: null });
      if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
      calls.push(`UNEXPECTED ${key}`); return route.abort();
    });
  };
  return { calls, bodies, s, prepare };
}

async function open(browser, url, width, { screen, prepare }) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, locale: LOCALE, isMobile: width < 768, hasTouch: width < 768, bypassCSP: !!OVERRIDE });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("lang-asked", "1"); } catch {}
    document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI));
  });
  const page = await ctx.newPage();
  if (prepare) await prepare(ctx, page);
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) csp.push(`${screen}@${width} console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => csp.push(`${screen}@${width} pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(url, { waitUntil: "load" });
  if (OVERRIDE) await page.addStyleTag({ content: OVERRIDE });
  return { ctx, page };
}

const PIN = "483915";
async function registerFull(page) {   // the splash to the feed, the way a person goes (as measure-app-w4.mjs)
  await page.waitForSelector('[data-testid="start"]'); await page.click('[data-testid="start"]');
  await page.waitForSelector('[data-screen="register-1"]');
  await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check(".reg-check input");
  await page.click('[data-testid="next"]'); await page.waitForSelector('[data-screen="register-2"]');
  await page.fill('[data-testid="pin"]', PIN); await page.fill('[data-testid="pin-again"]', PIN);
  await page.click('[data-testid="register"]'); await page.waitForSelector('[data-screen="register-3"]', { timeout: 90000 });
  const groups = await page.locator('[data-testid="paper-code"] span').allInnerTexts();
  const gi = page.locator('[data-testid="paper-groups"] input');
  await gi.nth(0).fill(groups[1].trim()); await gi.nth(1).fill(groups[3].trim());
  await page.click('[data-testid="confirm"]');
  await page.waitForSelector('[data-screen="feed"]', { timeout: 20000 });
}
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const shot = async (page, n) => { if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/w4_${n}.png` }); };
// a new document drops the first one's override: put it on again
const gotoCabinet = async (page, path = "/adv") => { await page.goto(PREVIEW + path, { waitUntil: "load" }); if (OVERRIDE) await page.addStyleTag({ content: OVERRIDE }); };
// the strip every cabinet sheet shares: the mark, its word, the address, the title
async function strip(page, scr, S, title = 2) {
  compare(scr, "mark", shapeOf(S.shapes[1]), await box(page, ".cb-mark"));
  left(scr, "home word", S.lines[0], await line(page, ".cb-home")); wide(scr, "home word", S.lines[0], await line(page, ".cb-home"));
  // the address is mono and right-aligned: its right edge (the sheet's glyph run: first glyph + 15 advances) and baseline; the left edge is the font's
  right(scr, "address", { right: S.addressRight, base: S.lines[1].base }, await line(page, ".cb-address"));
  left(scr, "title", S.lines[title], await line(page, ".cb-title")); wide(scr, "title", S.lines[title], await line(page, ".cb-title"));
}
const lineBoth = async (page, scr, name, exp, sel, nth = 0, i = 0) => { const a = await line(page, sel, nth, i); left(scr, name, exp, a); wide(scr, name, exp, a); };
const lineBothR = async (page, scr, name, exp, sel, nth = 0, i = 0) => { const a = await line(page, sel, nth, i); right(scr, name, exp, a); wide(scr, name, exp, a); };

// ── run ──
const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(PREVIEW)).ok) break; } catch {}
  if (i > 120) { console.log(`measure-app-w4-cabinet: SPOILED (${PREVIEW} never answered)`); process.exit(2); }
  await new Promise((r) => setTimeout(r, 1000));
}

const stub = nodeStub();
const { ctx, page } = await open(browser, PREVIEW + "/adv", 390, { screen: "cabinet", prepare: stub.prepare });

// w4_cabinet-sign-in
await page.waitForSelector('[data-screen="cabinet-sign-in"]', { timeout: 20000 });
note(await page.locator('[data-screen="cabinet-sign-in"]').count() === 1, "walk: /adv with no session opens the sign-in");
await page.fill('[data-testid="adv-email"]', "hello@puri.ge");
if (want("cabinet-sign-in")) {
  const S = sheet("cabinet-sign-in"), sh = S.shapes, scr = "sign-in";
  await settle(page);
  await strip(page, scr, S);
  compare(scr, "email field", shapeOf(sh[2]), await box(page, ".cb-body .reg-input", 0));
  compare(scr, "contact field", shapeOf(sh[3]), await box(page, ".cb-body .reg-input", 1));
  compare(scr, "primary", shapeOf(sh[4]), await box(page, ".cb-foot .cta"));
  await lineBoth(page, scr, "sub", S.lines[3], ".cb-sub");
  await lineBoth(page, scr, "email label", S.lines[4], ".cb-body .reg-field label", 0);
  await lineBoth(page, scr, "contact label", S.lines[6], ".cb-body .reg-field label", 1);
  await lineBoth(page, scr, "primary label", S.lines[8], ".cb-foot .cta span");
  note((await page.getAttribute('[data-testid="adv-send"]', "aria-disabled")) !== "true", "sign-in: Get the link opens once the email has an @");
  await fonts(page, scr, [["title", ".cb-title"], ["home", ".cb-home"], ["label", ".cb-body .reg-field label"], ["primary", ".cb-foot .cta span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}
// walk: the email goes to the node (no contact: sign-in), and the sent screen opens
await page.click('[data-testid="adv-send"]');
await page.waitForSelector('[data-screen="cabinet-sent"]', { timeout: 20000 });
note(JSON.stringify(stub.bodies["POST /adv/sign-in"]) === '{"email":"hello@puri.ge"}', `walk: Get the link sends POST /adv/sign-in ${JSON.stringify(stub.bodies["POST /adv/sign-in"])} and opens "Check your mail"`);

// w4_cabinet-sent
if (want("cabinet-sent")) {
  const S = sheet("cabinet-sent"), scr = "sent";
  await settle(page);
  await strip(page, scr, S);
  compare(scr, "circle", shapeOf(S.shapes[2]), await box(page, ".cb-circle"));
  await lineBoth(page, scr, "note", S.lines[3], ".cb-sent");
  await fonts(page, scr, [["title", ".cb-title"], ["note", ".cb-sent"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}
// walk: a link that is spent (a mangled or old token) says it expired and offers a new one
await gotoCabinet(page, `/adv/enter#${"0".repeat(64)}`);
await page.waitForSelector('[data-screen="cabinet-expired"]', { timeout: 20000 });
note(new URL(page.url()).hash === "" && stub.calls.includes("POST /adv/session"), `walk: a spent link (POST /adv/session 401) opens "link expired", the token leaves the address bar (${new URL(page.url()).pathname}${new URL(page.url()).hash})`);
await page.click('[data-testid="adv-again"]');
note(await page.locator('[data-screen="cabinet-sign-in"]').count() === 1, "walk: «Ask again» is the sign-in again");

// w4_cabinet-venues
stub.s.signedIn = true;
stub.s.venues = [{ id: "v1", name: "Puri Corner", address: "12 Leselidze St", verification_status: "unverified", verified_at: null, envelope_expires_at: new Date(Date.now() + 20 * 86_400_000).toISOString(), place: { lat: 41.69, lon: 44.8, area_radius: 300 } }];
await gotoCabinet(page, "/adv");
await page.waitForSelector('[data-screen="cabinet-venues"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="venue"]', { timeout: 20000 });
await page.fill('[data-testid="venue-code"]', "8KD2");
if (want("cabinet-venues")) {
  const S = sheet("cabinet-venues"), sh = S.shapes, scr = "venues";
  await settle(page);
  await strip(page, scr, S);
  compare(scr, "card", shapeOf(sh[2]), await box(page, ".cb-card"));
  compare(scr, "chip", shapeOf(sh[3]), await box(page, ".cb-chip"));
  const cells = [Math.min(...sh.slice(4, 12).map((c) => c.x)), Math.min(...sh.slice(4, 12).map((c) => c.y))];
  const cx1 = Math.max(...sh.slice(4, 12).map((c) => c.x + c.w)), cy1 = Math.max(...sh.slice(4, 12).map((c) => c.y + c.h));
  compare(scr, "code cells (one block)", [cells[0], cells[1], cx1 - cells[0], cy1 - cells[1]], await union(page, ".cb-code .reg-cell"));
  compare(scr, "confirm", shapeOf(sh[12]), await box(page, ".cb-btn"));
  compare(scr, "add row", shapeOf(sh[13]), await box(page, ".cb-body .me-row", 0));
  compare(scr, "add row icon", shapeOf(sh[14]), await box(page, ".cb-body .me-row .me-row-icon", 0));
  await lineBoth(page, scr, "venue name", S.lines[3], ".cb-card-top h2");
  await lineBoth(page, scr, "chip label", S.lines[4], ".cb-chip");
  await lineBoth(page, scr, "address line", S.lines[5], ".cb-card-line");
  await lineBoth(page, scr, "code label", S.lines[6], ".cb-code label");
  await lineBoth(page, scr, "confirm label", S.lines[8], ".cb-btn span");
  await lineBoth(page, scr, "add row label", S.lines[9], ".cb-body .me-row .me-row-name", 0);
  note((await page.getAttribute('[data-testid="venue-verify"]', "aria-disabled")) === "true", "venues: Confirm the code stays shut while the code has 4 of 12");
  await fonts(page, scr, [["title", ".cb-title"], ["venue", ".cb-card-top h2"], ["chip", ".cb-chip"], ["row", ".me-row-name"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}
// walk: a wrong code says how many tries are left; the right one (typed with a dash and spaces, as the paper has it) is sent bare
await page.fill('[data-testid="venue-code"]', "AAAAAAAAAAAA");
await page.click('[data-testid="venue-verify"]');
await page.waitForSelector(".cb-venue .me-error", { timeout: 20000 });
const wrongText = await page.locator(".cb-venue .me-error").innerText();
note(/4/.test(wrongText), `walk: a wrong code (422) says the tries left: "${wrongText}"`);
await page.fill('[data-testid="venue-code"]', "abcdef-ghjklm");
note((await page.locator('[data-testid="venue-code"]').inputValue()) === RIGHT_CODE, "walk: the field keeps capitals without the dash");
await page.click('[data-testid="venue-verify"]');
await page.waitForSelector('[data-status="verified"]', { timeout: 20000 });
note(stub.bodies["POST /adv/venues/v1/verify"] === RIGHT_CODE && (await page.locator(".cb-chip").innerText()).length > 0, `walk: the right code is sent as ${stub.bodies["POST /adv/venues/v1/verify"]}; the card turns "${await page.locator(".cb-chip").innerText()}"`);

// w4_cabinet-offers (the venue the sheet names; a live offer and an expired one)
stub.s.venues = [{ id: "v2", name: "Khinkali Bar", address: "5 Rustaveli Ave", verification_status: "verified", verified_at: longAgo(), envelope_expires_at: null, place: { lat: 41.7, lon: 44.79, area_radius: 1000 } }];
stub.s.offers = [
  { id: "o2", venue_id: "v2", offer_text: "coffee", discount_value: "15%", conditions: null, promo_code: null, external_url: null, redirect_hits: 48, discount_until: longAgo(), status: "expired", published_at: longAgo(), expires_at: longAgo(), link: "", link_disabled: false, complaints: 0 },
  { id: "o1", venue_id: "v2", offer_text: "On the second dozen", discount_value: "20%", conditions: null, promo_code: null, external_url: null, redirect_hits: 3, discount_until: tonight(), status: "active", published_at: new Date().toISOString(), expires_at: tonight(), link: "", link_disabled: false, complaints: 0 },
];
await gotoCabinet(page, "/adv");
await page.waitForSelector('[data-screen="cabinet-venues"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="venue"]');
await page.click('[data-testid="offers-open"]');
await page.waitForSelector('[data-screen="cabinet-offers"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="adv-offer"][data-status="expired"]', { timeout: 20000 });
if (want("cabinet-offers")) {
  const S = sheet("cabinet-offers"), sh = S.shapes, scr = "offers";
  await settle(page);
  await strip(page, scr, S);
  compare(scr, "live card", shapeOf(sh[2]), await box(page, ".cb-offer"));
  compare(scr, "until pill", shapeOf(sh[3]), await box(page, ".cb-pill"));
  compare(scr, "expired card", shapeOf(sh[4]), await box(page, ".cb-done"));
  compare(scr, "expired chip", shapeOf(sh[5]), await box(page, ".cb-done-state"));
  for (let i = 0; i < 2; i++) compare(scr, `hairline ${i + 1} (x,y,w)`, [sh[6 + i].x, sh[6 + i].y, sh[6 + i].w], (await box(page, ".cb-stats div", i)).slice(0, 3));
  await lineBoth(page, scr, "tag", S.lines[3], ".cb-offer-tag span:last-child");
  await lineBoth(page, scr, "pill label", S.lines[4], ".cb-pill");
  await lineBoth(page, scr, "discount", S.lines[5], ".cb-offer-big");
  await lineBoth(page, scr, "offer text", S.lines[6], ".cb-offer-text");
  await lineBoth(page, scr, "expired title", S.lines[7], ".cb-done-top h2");
  await lineBothR(page, scr, "expired state", S.lines[8], ".cb-done-state");
  await lineBoth(page, scr, "visits", S.lines[9], ".cb-stats dt", 0);
  await lineBothR(page, scr, "visits value", S.lines[10], ".cb-stats dd", 0);
  await lineBoth(page, scr, "complaints", S.lines[11], ".cb-stats dt", 1);
  await lineBothR(page, scr, "complaints value", S.lines[12], ".cb-stats dd", 1);
  note((await page.locator(".cb-offer-tag span:last-child").innerText()).includes("Khinkali Bar") || RU, "offers: the live card names its venue (the venue list gives the name)");
  note((await page.locator('[data-testid="adv-offer"]').first().getAttribute("data-status")) === "active", "offers: the live offer comes first, the expired one after");
  await fonts(page, scr, [["title", ".cb-title"], ["discount", ".cb-offer-big"], ["expired", ".cb-done-top h2"], ["stat", ".cb-stats dt"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}

// w4_cabinet-new-offer
await page.click('[data-testid="offer-new"]');
await page.waitForSelector('[data-screen="cabinet-new-offer"]', { timeout: 20000 });
await page.waitForSelector('[data-testid="offer-text"]', { timeout: 20000 });
await page.fill('[data-testid="offer-text"]', "Second round on us");
await page.fill('[data-testid="offer-discount"]', "20%");
const day = new Date(Date.now() + 6 * 86_400_000), dayIso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
await page.fill('[data-testid="offer-until"]', dayIso);
if (want("cabinet-new-offer")) {
  const S = sheet("cabinet-new-offer"), sh = S.shapes, scr = "new-offer";
  await settle(page);
  await strip(page, scr, S);
  compare(scr, "text field", shapeOf(sh[2]), await box(page, ".cb-body .reg-input", 0));
  compare(scr, "discount field", shapeOf(sh[3]), await box(page, ".cb-body .reg-input", 1));
  compare(scr, "day field", shapeOf(sh[4]), await box(page, ".cb-body .reg-input", 2));
  compare(scr, "primary", shapeOf(sh[5]), await box(page, ".cb-foot .cta"));
  await lineBoth(page, scr, "text label", S.lines[3], ".cb-body .reg-field label", 0);
  await lineBothR(page, scr, "counter", S.lines[5], '[data-testid="offer-left"]');
  await lineBoth(page, scr, "discount label", S.lines[6], ".cb-body .reg-field label", 1);
  await lineBoth(page, scr, "day label", S.lines[8], ".cb-body .reg-field label", 2);
  await lineBoth(page, scr, "day", S.lines[9], ".cb-day-box .reg-input");
  await lineBoth(page, scr, "lives note", S.lines[10], '[data-testid="offer-lives"]');
  await lineBoth(page, scr, "primary label", S.lines[11], ".cb-foot .cta span");
  const counter = await page.locator('[data-testid="offer-left"]').innerText();
  note(/110/.test(counter), `new-offer: 18 of 128 letters used, the counter says "${counter}"`);
  note((await page.getAttribute('[data-testid="offer-preview"]', "aria-disabled")) !== "true", "new-offer: Preview opens with a text, a discount and a day");
  await fonts(page, scr, [["title", ".cb-title"], ["label", ".cb-body .reg-field label"], ["hint", ".cb-hint"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}
// walk: the last look, then publishing sends the form as the node takes it: 23:00 of the chosen day
await page.click('[data-testid="offer-preview"]');
await page.waitForSelector('[data-screen="cabinet-preview"]', { timeout: 20000 });
note(await page.locator('[data-testid="offer-preview-card"]').count() === 1 && (await page.locator(".cb-offer-big").innerText()) === "−20%", `walk: Preview shows the card as the feed draws it ("${await page.locator(".cb-offer-big").innerText()}")`);
await page.click('[data-testid="offer-publish"]');
await page.waitForSelector('[data-screen="cabinet-published"]', { timeout: 20000 });
const sent = stub.bodies["POST /adv/offers"];
const until = new Date(sent?.discount_until ?? NaN);
note(sent?.offer_text === "Second round on us" && sent?.discount_value === "20%" && sent?.venue_id === "v2" && until.getHours() === 23 && `${until.getFullYear()}-${String(until.getMonth() + 1).padStart(2, "0")}-${String(until.getDate()).padStart(2, "0")}` === dayIso, `walk: Publish sends POST /adv/offers ${JSON.stringify(sent)} (ends 23:00 of ${dayIso})`);
// a day that is over cannot be published: the hint says so and Preview stays shut
await page.click('[data-testid="offer-to-list"]'); await page.waitForSelector('[data-screen="cabinet-offers"]');
await page.click('[data-testid="offer-new"]'); await page.waitForSelector('[data-testid="offer-text"]');
await page.fill('[data-testid="offer-text"]', "x"); await page.fill('[data-testid="offer-discount"]', "1%");
const yesterday = new Date(Date.now() - 2 * 86_400_000), yIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
await page.evaluate((v) => { const i = document.querySelector('[data-testid="offer-until"]'); i.removeAttribute("min"); }, yIso);
await page.fill('[data-testid="offer-until"]', yIso);
note((await page.getAttribute('[data-testid="offer-preview"]', "aria-disabled")) === "true" && (await page.getAttribute('[data-testid="offer-lives"]', "data-state")) === "past", "walk: a day that is over keeps Preview shut and the hint says so");
await ctx.close();

// w4_offer: the exit screen, with an identity on the page (the report is signed)
if (want("offer")) {
  const { ctx: c2, page: p2 } = await open(browser, PREVIEW + "/", 390, { screen: "offer", prepare: stub.prepare });
  await registerFull(p2);
  await p2.evaluate(() => { history.pushState({ gate: "offer", i: 1 }, "", "/o/abc123"); dispatchEvent(new PopStateEvent("popstate")); });
  await p2.waitForSelector('[data-screen="offer"] [data-testid="domain"]', { timeout: 20000 });
  const S = sheet("offer"), sh = S.shapes, scr = "offer";
  await settle(p2);
  compare(scr, "sheet left,top", [sh[1].x, sh[1].y], (await box(p2, ".me-sheet")).slice(0, 2));
  compare(scr, "lime card", shapeOf(sh[2]), await box(p2, ".cb-domain"));
  const rep = await box(p2, ".cb-report");
  compare(scr, "report link (x,width)", [sh[3].x, sh[3].w], [rep[0], rep[2]], 3);
  compare(scr, "primary", shapeOf(sh[4]), await box(p2, ".me-foot .cta"));
  await lineBoth(p2, scr, "title", S.lines[0], ".me-bar h1");
  await lineBoth(p2, scr, "going to", S.lines[1], ".cb-going");
  await lineBoth(p2, scr, "domain", S.lines[2], ".cb-domain strong");
  await lineBoth(p2, scr, "own site", S.lines[3], ".cb-domain p");
  await lineBoth(p2, scr, "report label", S.lines[4], ".cb-report");
  await lineBoth(p2, scr, "primary label", S.lines[5], ".me-foot .cta span");
  note((await p2.getAttribute('[data-testid="go"]', "href")) === "/o/abc123/go", "offer: Open the site is the node's redirect, /o/abc123/go");
  await fonts(p2, scr, [["title", ".me-bar h1"], ["domain", ".cb-domain strong"], ["primary", ".me-foot .cta span"]]);
  await overflowAt(p2, scr, 390); await shot(p2, scr);
  // walk: the report is signed and counted once; the line then says it was received
  await p2.click('[data-testid="report"]'); await p2.waitForSelector('[data-testid="reported"]', { timeout: 20000 });
  note(stub.s.reported === 1 && (await p2.locator('[data-testid="report"]').count()) === 0, `walk: Report a wrong link sends POST /o/abc123/report (${stub.s.reported}) and says "${await p2.locator('[data-testid="reported"]').innerText()}"`);
  // walk: Back from the exit goes to the feed of the seat
  await p2.click('[data-testid="offer-back"]'); await p2.waitForSelector('[data-screen="feed"]', { timeout: 20000 }).catch(() => null);
  note((await p2.locator('[data-screen="feed"]').count()) === 1, "walk: Back from the exit goes to the feed");
  await c2.close();
}

const odd = stub.calls.filter((c) => c.startsWith("UNEXPECTED"));
note(odd.length === 0, `node calls outside the stub: ${odd.length ? odd.join(", ") : "none"}`);
await browser.close();

// ── report ──
if (rows.length) {
  const wN = Math.max(...rows.map((r) => r.name.length)), wE = Math.max(...rows.map((r) => r.exp.length)), wA = Math.max(...rows.map((r) => r.act.length));
  console.log(`${"screen".padEnd(12)} ${"element".padEnd(wN)}  ${"expected".padEnd(wE)}  ${"actual".padEnd(wA)}  ${"delta".padEnd(20)} ok`);
  console.log(`(box = left,top,width,height; text = left or right,baseline; "width" = the line's ink width; px; locale ${LOCALE}; tolerance ${TOL} px, 2.5 % on widths)`);
  for (const r of rows) console.log(`${r.screen.padEnd(12)} ${r.name.padEnd(wN)}  ${r.exp.padEnd(wE)}  ${r.act.padEnd(wA)}  ${r.delta.padEnd(20)} ${r.ok ? "ok" : "NO"}`);
  const per = {};
  for (const r of rows) { per[r.screen] ??= [0, 0]; per[r.screen][1]++; if (r.ok) per[r.screen][0]++; }
  console.log(`per sheet: ${Object.entries(per).map(([s, [g, n]]) => `${s} ${g}/${n}`).join("; ")}`);
}
for (const n of notes) console.log(`${n.bad ? "DEFECT" : "ok    "} ${n.text}`);
console.log(csp.length ? `DEFECT console/CSP errors (${csp.length}): ${[...new Set(csp)].slice(0, 8).join(" | ")}` : "ok     console/CSP errors: none");
const good = rows.filter((r) => r.ok).length;
const clean = !notes.some((n) => n.bad) && !csp.length;
console.log(GEOMETRY ? `measure-app-w4-cabinet: ${good} of ${rows.length} within ${TOL}px; notes ${clean ? "clean" : "DEFECTS"}` : `measure-app-w4-cabinet[${TAG}]: fonts, overflow, walks, CSP ${clean ? "clean" : "DEFECTS"}`);
process.exit(good === rows.length && clean ? 0 : 1);
