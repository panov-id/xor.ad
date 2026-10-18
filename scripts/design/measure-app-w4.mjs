// Measures the rendered app/ "Me" and what opens from it against the Dusk sheets of wave 4 (mobile w4_me,
// w4_me-edit-name, w4_me-pin, w4_me-reset, w4_place, w4_place-qr, w4_theme, w4_legal, w4_statements, w4_step-away,
// w4_age-filter), and walks what they do against a stubbed node (change the PIN, accept the terms, the filter's
// PATCH, step away, choose a city, start again). Run by scripts/measure-app-w4.sh inside the Playwright image, on an
// internal network: PREVIEW is the built app (with its CSP) in the container called `app`.
//
// Expected values are read from the sheets (sheet-geometry.mjs), never typed in; indices are the sheets' drawing
// order (shape 0 is the night). Per element: left/top/width/height of the box against the shape; per text line:
// the left edge (or the right edge of a right-aligned value) and the baseline against the sheet's ink. The
// sheets' canvas is 388 wide in a 390 viewport: the sheet panel is compared by its left/top only.
// Not compared: the words inside inputs (the DOM has no text node for them), the chats tab's red dot (this shell
// does not know unread talks), the theme sheet's auto and dark swatches (drawn as images, not filled paths).
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
const sheet = (n) => readSheet(`${SHEETS}/w4_${n}.svg`);

const rows = [], notes = [], csp = [];
const NAN4 = [NaN, NaN, NaN, NaN];
const fmt = (a) => a.map((v) => (Number.isNaN(v) ? "-" : v.toFixed(1))).join(",");
function compare(screen, name, exp, act) {
  if (!GEOMETRY) return;
  const d = exp.map((e, i) => act[i] - e);
  const ok = d.every((x) => !Number.isNaN(x) && Math.abs(x) <= TOL);
  rows.push({ screen, name, exp: fmt(exp), act: fmt(act), delta: d.map((x) => (Number.isNaN(x) ? "NaN" : (x >= 0 ? "+" : "") + x.toFixed(1))).join(","), ok });
}
const note = (ok, text) => notes.push({ bad: !ok, text });
const shapeOf = (s) => [s.x, s.y, s.w, s.h];
// text: the left ink edge and the baseline; a right-aligned value: its right edge and the baseline
const left = (scr, name, exp, act) => compare(scr, name, [exp.left, exp.base], act ? [act[0], act[2]] : [NaN, NaN]);
const right = (scr, name, exp, act) => compare(scr, name, [exp.right, exp.base], act ? [act[1], act[2]] : [NaN, NaN]);

async function settle(page) {
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { a.cancel(); } }));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(100);
}
const boxOf = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; }), sel);
const box = async (page, sel, i = 0) => (await boxOf(page, sel))[i] ?? NAN4;
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
      if (e.tagName !== "INPUT" && clips && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains("me-body")) out.push(`${tag} clips horizontally: scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
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

// ── the node, stubbed: the routes the registration, the feed and Me call ──
const NODE_PATH = /^\/(identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|statements|likes|inbox|away)(\/|$)/;
const ACCEPTED = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
// After the registration the node publishes new revisions: the terms changed on 14 Oct (a new hash), privacy and the
// rules re-dated with the hash this device accepted (w4_legal: one changed, two not).
const LATER = [
  { document: "terms", revision_date: "2026-10-14", revision_sha256: "sha-terms-2", reaccept: "required" },
  { document: "privacy", revision_date: "2026-10-02", revision_sha256: "sha-privacy", reaccept: "none" },
  { document: "guidelines", revision_date: "2026-09-01", revision_sha256: "sha-guidelines", reaccept: "none" },
];
function nodeStub() {
  const calls = [], patches = [], accepts = [];
  const s = { share: null, pinAuth: null, pinHash: null, docs: ACCEPTED, away: null, closed: false, restricted: false };
  const prepare = async (ctx) => {
    await ctx.route("**/*", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
      const key = `${req.method()} ${u.pathname}`; calls.push(key);
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() ?? "{}");
      if (key === "GET /legal/manifest") return json(200, { documents: s.docs });
      if (key === "POST /legal/accept") { accepts.push(body()); return json(200, {}); }
      if (key === "POST /identities") { s.share = body().share; s.pinAuth = null; return json(200, { identity_id: "id-stub", session_id: "sess-stub" }); }
      if (key === "POST /vault/share") {
        const auth = body().auth;
        if (s.pinAuth === null && s.pinHash === null) { s.pinAuth = auth; return json(200, { share: s.share }); }
        const hash = s.pinHash ? Buffer.from(await crypto.subtle.digest("SHA-256", Buffer.from(auth, "base64url"))).toString("hex") : null;
        if (s.pinHash ? hash === s.pinHash : auth === s.pinAuth) return json(200, { share: s.share });
        return json(409, { error: { code: "pin_mismatch", attempts_left: 9 } });
      }
      if (key === "POST /vault/pin") {   // the old proof, then the new PIN's hash and share (client.changePin)
        const b = body();
        if (b.current_auth !== s.pinAuth) return json(409, { error: { code: "pin_mismatch", attempts_left: 9 } });
        s.pinHash = b.next_auth_hash; s.share = b.next_share; s.pinAuth = "changed";
        return json(200, {});
      }
      if (key === "GET /identities/me") return json(200, { name: "Alex", name_state: "accepted", age: 32, phrases: [{ id: "p1" }, { id: "p2" }], filter_age_min: 25, filter_age_max: 35 });
      if (key === "PATCH /identities/me") { patches.push(body()); return json(200, {}); }
      if (key === "GET /statements") return json(200, { items: !s.restricted ? [] : [{ id: "st-1", restriction: "removed", facts: "Phrase “Selling…”", ground_kind: "contractual", ground_text: "Rules § 4 · ads", automated_used: false, created_at: Date.UTC(2026, 9, 12, 12) / 1000 }] });
      if (key === "GET /likes") return json(200, { items: [1, 2, 3, 4, 5].map((n) => ({ id: `l${n}`, text: `liked ${n}`, like_count: 1, state: "liked", liked_at: 0 })), next: null });
      if (key === "GET /inbox") { const end = Math.floor(Date.now() / 1000) + 86400; return json(200, { items: [1, 2, 3].map((n) => ({ kind: "chat", state: "open", id: `c${n}`, chat_expires_at: end })), events: {} }); }
      if (key === "POST /away") { s.away = body().span; return json(200, { until: Math.floor(Date.now() / 1000) + 3600 }); }
      if (key === "POST /identities/close") { s.closed = true; return json(200, {}); }
      if (key === "GET /feed") return json(200, { items: [], next: null });
      if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
      calls.push(`UNEXPECTED ${key}`); return route.abort();
    });
  };
  return { calls, patches, accepts, s, prepare };
}

async function open(browser, url, width, { screen, prepare }) {
  const h = width === 390 ? 844 : width === 834 ? 1194 : 900;
  const ctx = await browser.newContext({ viewport: { width, height: h }, deviceScaleFactor: 1, locale: LOCALE, isMobile: width < 768, hasTouch: width < 768, bypassCSP: !!OVERRIDE });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("lang-asked", "1"); } catch {}
    // w4_me: "Sololaki · identity on this device" — a place chosen before (the web's key, the web's shape)
    try { if (!localStorage.getItem("place.v1")) localStorage.setItem("place.v1", JSON.stringify({ lat: 41.689, lon: 44.8, name: "Sololaki", cc: "GE", source: "point" })); } catch {}
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
async function registerFull(page) {   // the splash to the feed, the way a person goes (as measure-app.mjs)
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
const enter = async (page, testid, screenName) => { await page.click(`[data-testid="${testid}"]`); await page.waitForSelector(`[data-screen="${screenName}"]`, { timeout: 20000 }); };
const leave = async (page, screenName) => { await page.click(`[data-testid="${screenName}-back"]`); await page.waitForSelector('[data-screen="me"]', { timeout: 20000 }); };
// the frame every sub-page shares: the sheet's top-left, the title
async function frame(page, scr, S) {
  compare(scr, "sheet left,top", [S.shapes[1].x, S.shapes[1].y], (await box(page, ".me-sheet")).slice(0, 2));
  left(scr, "title", S.lines[0], await line(page, ".me-bar h1"));
}
const cta = async (page, scr, S, i, t) => { compare(scr, "primary", shapeOf(S.shapes[i]), await box(page, ".me-foot .cta")); left(scr, "primary label", S.lines[t], await line(page, ".me-foot .cta span")); };

// ── run ──
const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(PREVIEW)).ok) break; } catch {}
  if (i > 120) { console.log(`measure-app-w4: SPOILED (${PREVIEW} never answered)`); process.exit(2); }
  await new Promise((r) => setTimeout(r, 1000));
}

const stub = nodeStub();
const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: "w4", prepare: stub.prepare });
await registerFull(page);
stub.s.docs = LATER;
await page.click('[data-testid="tab-me"]'); await page.waitForSelector('[data-screen="me"]', { timeout: 20000 });
await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid="me-name-age"]')?.textContent ?? ""), null, { timeout: 20000 });
note(new URL(page.url()).pathname === "/me", `walk: the tab bar's «me» opens Me at ${new URL(page.url()).pathname}`);

// w4_me
if (want("me")) {
  const S = sheet("me"), sh = S.shapes, scr = "me";
  await settle(page);
  compare(scr, "sheet left,top", [sh[1].x, sh[1].y], (await box(page, ".me-sheet")).slice(0, 2));
  compare(scr, "name card", shapeOf(sh[2]), await box(page, ".me-hero"));
  compare(scr, "avatar", shapeOf(sh[3]), await box(page, ".me-avatar"));
  compare(scr, "edit", shapeOf(sh[4]), await box(page, ".me-edit"));
  for (let i = 0; i < 7; i++) compare(scr, `row ${i + 1}`, shapeOf(sh[5 + i]), await box(page, ".me-rows .me-row", i));
  compare(scr, "tab bar", shapeOf(sh[12]), await box(page, ".tabbar"));
  compare(scr, "tab me (lime)", shapeOf(sh[13]), await box(page, '.tab[aria-current="page"]'));
  left(scr, "brand word", S.lines[0], await line(page, ".me-head .word"));
  left(scr, "avatar letter", S.lines[1], await line(page, ".me-avatar"));
  left(scr, "name, age", S.lines[2], await line(page, ".me-who h1"));
  left(scr, "place line 1", S.lines[3], await line(page, ".me-who p", 0, 0));
  left(scr, "place line 2", S.lines[4], await line(page, ".me-who p", 0, 1));
  left(scr, "edit label", S.lines[5], await line(page, ".me-edit"));
  const names = [6, 8, 10, 12, 13, 14, 15];
  for (let i = 0; i < 7; i++) left(scr, `row ${i + 1} name`, S.lines[names[i]], await line(page, ".me-rows .me-row-name", i));
  for (const [i, t] of [[0, 7], [1, 9], [2, 11]]) right(scr, `row ${i + 1} value`, S.lines[t], await line(page, `.me-rows .me-row:nth-child(${i + 1}) .me-row-value`));
  note((await page.locator(".me-rows .me-row").nth(0).innerText()).includes("Theme") || RU, `me: the first row is the theme (sheet order): "${(await page.locator(".me-rows .me-row").nth(0).innerText()).replace(/\n/g, " ")}"`);
  await fonts(page, scr, [["name", ".me-who h1"], ["row", ".me-row-name"], ["edit", ".me-edit"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}

// w4_me-edit-name
if (want("me-edit-name")) {
  const S = sheet("me-edit-name"), sh = S.shapes, scr = "edit-name";
  await enter(page, "me-name", "edit-name"); await settle(page);
  await frame(page, scr, S);
  compare(scr, "name field", shapeOf(sh[2]), await box(page, ".me-body .reg-input", 0));
  compare(scr, "age field", shapeOf(sh[3]), await box(page, ".me-body .reg-input", 1));
  compare(scr, "notice", shapeOf(sh[4]), await box(page, ".me-note"));
  await cta(page, scr, S, 5, 8);
  left(scr, "name label", S.lines[1], await line(page, ".me-body .reg-field label", 0));
  right(scr, "counter", S.lines[3], await line(page, '[data-testid="edit-left"]'));
  left(scr, "age label", S.lines[4], await line(page, ".me-body .reg-field label", 1));
  left(scr, "notice line 1", S.lines[6], await line(page, ".me-note span", 0, 0));
  left(scr, "notice line 2", S.lines[7], await line(page, ".me-note span", 0, 1));
  note((await page.inputValue('[data-testid="edit-name"]')) === "Alex" && (await page.inputValue('[data-testid="edit-age"]')) === "32", "edit-name: the fields hold the profile's Alex and 32 (the sheet's)");
  await fonts(page, scr, [["title", ".me-bar h1"], ["notice", ".me-note span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  // walk: a new name is sent as the web sends it, and Me reads the profile again
  await page.fill('[data-testid="edit-name"]', "Alexa"); await page.click('[data-testid="edit-save"]');
  await page.waitForSelector('[data-screen="me"]', { timeout: 20000 });
  note(JSON.stringify(stub.patches.at(-1)) === '{"name":"Alexa"}', `walk: Save sends PATCH /identities/me ${JSON.stringify(stub.patches.at(-1))} and returns to Me`);
}

// w4_me-pin
if (want("me-pin")) {
  const S = sheet("me-pin"), sh = S.shapes, scr = "me-pin";
  await enter(page, "me-pin", "change-pin");
  await page.fill('[data-testid="pin-current"]', PIN); await page.fill('[data-testid="pin-next"]', "271828"); await page.fill('[data-testid="pin-again"]', "271");
  await page.focus('[data-testid="pin-again"]'); await settle(page);
  await frame(page, scr, S);
  const cells = await boxOf(page, ".me-body .reg-cell"), dots = await boxOf(page, ".me-body .reg-cell i");
  const cellIdx = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 35], dotIdx = [3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
  cellIdx.forEach((s, i) => compare(scr, `cell ${i + 1}`, shapeOf(sh[s]), cells[i] ?? NAN4));
  dotIdx.forEach((s, i) => compare(scr, `dot ${i + 1}`, shapeOf(sh[s]), dots[i] ?? NAN4));
  const ring = await page.evaluate(() => { const a = document.querySelector(".reg-cells:focus-within .reg-cell[data-active]"); if (!a) return null; const r = a.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; });
  compare(scr, "caret ring (repeat, 4th)", shapeOf(sh[33]), ring ?? NAN4);
  await cta(page, scr, S, 36, 4);
  for (let i = 0; i < 3; i++) left(scr, `label ${i + 1}`, S.lines[1 + i], await line(page, ".me-body .reg-field label", i));
  note((await page.getAttribute('[data-testid="pin-go"]', "aria-disabled")) === "true", "me-pin: Save the PIN stays shut while the repeat has 3 of 6");
  await fonts(page, scr, [["title", ".me-bar h1"], ["label", ".me-body .reg-field label"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  // walk: the PIN changed and the vault sealed again under it (POST /vault/pin, then the new share)
  await page.fill('[data-testid="pin-again"]', "271828"); await page.click('[data-testid="pin-go"]');
  await page.waitForSelector('[data-screen="me"]', { timeout: 60000 }).catch(() => null);
  note(stub.calls.includes("POST /vault/pin") && (await page.locator('[data-screen="me"]').count()) === 1, `walk: Save the PIN calls POST /vault/pin and returns to Me (calls: ${stub.calls.filter((c) => c.includes("vault")).join(", ")})`);
}

// w4_place
if (want("place")) {
  const S = sheet("place"), sh = S.shapes, scr = "place";
  await page.locator('[data-testid="me-place"]').scrollIntoViewIfNeeded();
  await enter(page, "me-place", "place");
  await page.fill('[data-testid="place-search"]', "Tbil"); await page.fill('[data-testid="place-point"]', "41.6900, 44.8010");
  await page.waitForSelector('[data-testid="place-city"]', { timeout: 20000 }); await settle(page);
  await frame(page, scr, S);
  compare(scr, "city field", shapeOf(sh[2]), await box(page, ".me-body .reg-input", 0));
  compare(scr, "city 1", shapeOf(sh[3]), await box(page, '[data-testid="place-city"]', 0));
  compare(scr, "city 1 icon", shapeOf(sh[4]), await box(page, '[data-testid="place-city"] .me-row-icon', 0));
  compare(scr, "city 2", shapeOf(sh[5]), await box(page, '[data-testid="place-city"]', 1));
  compare(scr, "city 2 icon", shapeOf(sh[6]), await box(page, '[data-testid="place-city"] .me-row-icon', 1));
  compare(scr, "point field", shapeOf(sh[7]), await box(page, ".me-body .reg-input", 1));
  compare(scr, "QR row", shapeOf(sh[8]), await box(page, '[data-testid="place-qr"]'));
  compare(scr, "QR row icon", shapeOf(sh[9]), await box(page, '[data-testid="place-qr"] .me-row-icon'));
  left(scr, "city label", S.lines[1], await line(page, ".me-body .reg-field label", 0));
  left(scr, "city 1 name", S.lines[3], await line(page, '[data-testid="place-city"] .me-row-name', 0));
  right(scr, "city 1 country", S.lines[4], await line(page, '[data-testid="place-city"] .me-row-value', 0));
  left(scr, "city 2 name", S.lines[5], await line(page, '[data-testid="place-city"] .me-row-name', 1));
  right(scr, "city 2 country", S.lines[6], await line(page, '[data-testid="place-city"] .me-row-value', 1));
  left(scr, "point label", S.lines[7], await line(page, ".me-body .reg-field label", 1));
  left(scr, "QR row label", S.lines[9], await line(page, '[data-testid="place-qr"] .me-row-name'));
  const first = (await page.locator('[data-testid="place-city"]').nth(0).innerText()).replace(/\n/g, " ");
  note(/Tbilisi/.test(first) && /(Georgia|Грузия)/.test(first), `place: «Tbil» finds Tbilisi first, with its country: "${first}"`);
  await fonts(page, scr, [["row", ".me-row-name"], ["label", ".me-body .reg-field label"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);

  // w4_place-qr (from the place screen)
  if (want("place-qr")) {
    const Q = sheet("place-qr"), qs = Q.shapes, qscr = "place-qr";
    await page.click('[data-testid="place-qr"]'); await page.waitForSelector('[data-screen="place-qr"]'); await settle(page);
    await frame(page, qscr, Q);
    compare(qscr, "white card", shapeOf(qs[2]), await box(page, ".me-qr-card"));
    const mods = qs.filter((s) => s.fill === "#121212");
    const x0 = Math.min(...mods.map((m) => m.x)), y0 = Math.min(...mods.map((m) => m.y)), x1 = Math.max(...mods.map((m) => m.x + m.w)), y1 = Math.max(...mods.map((m) => m.y + m.h));
    compare(qscr, "code", [x0, y0, x1 - x0, y1 - y0], await box(page, ".me-qr"));
    compare(qscr, "primary", shapeOf(qs.at(-1)), await box(page, ".me-foot .cta"));
    left(qscr, "primary label", Q.lines[3], await line(page, ".me-foot .cta span"));
    left(qscr, "what line 1", Q.lines[1], await line(page, ".me-qr-what", 0, 0));
    left(qscr, "what line 2", Q.lines[2], await line(page, ".me-qr-what", 0, 1));
    const link = await page.getAttribute('[data-testid="qr-code"]', "data-link");
    note(/\/location#p=-?\d+\.-?\d+&s=3$/.test(link ?? ""), `place-qr: the code carries the web's link ${link}`);
    await overflowAt(page, qscr, 390); await shot(page, qscr);
    await page.click('[data-testid="place-qr-back"]'); await page.waitForSelector('[data-screen="place"]');
  }
  // walk: a city chosen is kept where the web keeps it, and Me says it (the picker opens empty again after the QR)
  await page.fill('[data-testid="place-search"]', "Tbil"); await page.waitForSelector('[data-testid="place-city"]', { timeout: 20000 });
  await page.locator('[data-testid="place-city"]').nth(0).click(); await page.waitForSelector('[data-screen="me"]');
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("place.v1") ?? "null"));
  note(kept?.name === "Tbilisi" && kept?.cc === "GE" && (await page.locator(".me-who p").innerText()).includes("Tbilisi"), `walk: a city chosen is kept in place.v1 (${kept?.name}/${kept?.cc}) and Me shows it`);
  await page.evaluate(() => localStorage.setItem("place.v1", JSON.stringify({ lat: 41.689, lon: 44.8, name: "Sololaki", cc: "GE", source: "point" })));
}

// w4_theme
if (want("theme")) {
  const S = sheet("theme"), sh = S.shapes, scr = "theme";
  await enter(page, "me-theme", "theme"); await settle(page);
  await frame(page, scr, S);
  compare(scr, "auto tile", shapeOf(sh[2]), await box(page, '[data-testid="theme-auto"]'));
  compare(scr, "dusk tile", shapeOf(sh[3]), await box(page, '[data-testid="theme-dusk"]'));
  compare(scr, "dusk swatch", shapeOf(sh[5]), await box(page, '[data-testid="theme-dusk"] .me-swatch'));
  compare(scr, "light tile", shapeOf(sh[6]), await box(page, '[data-testid="theme-light"]'));
  compare(scr, "light swatch", shapeOf(sh[7]), await box(page, '[data-testid="theme-light"] .me-swatch'));
  compare(scr, "dark tile", shapeOf(sh[8]), await box(page, '[data-testid="theme-dark"]'));
  left(scr, "auto", S.lines[1], await line(page, '[data-testid="theme-auto"] .me-theme-name'));
  left(scr, "auto sub", S.lines[2], await line(page, '[data-testid="theme-auto"] .me-theme-sub'));
  left(scr, "dusk", S.lines[3], await line(page, '[data-testid="theme-dusk"] .me-theme-name'));
  left(scr, "dusk sub", S.lines[4], await line(page, '[data-testid="theme-dusk"] .me-theme-sub'));
  left(scr, "light", S.lines[5], await line(page, '[data-testid="theme-light"] .me-theme-name'));
  left(scr, "dark", S.lines[6], await line(page, '[data-testid="theme-dark"] .me-theme-name'));
  left(scr, "kept", S.lines[7], await line(page, ".me-kept"));
  note((await page.getAttribute('[data-testid="theme-dusk"]', "aria-checked")) === "true", "theme: Dusk is the chosen tile");
  await overflowAt(page, scr, 390); await shot(page, scr);
  await leave(page, "theme");
}

// w4_legal
if (want("legal")) {
  const S = sheet("legal"), sh = S.shapes, scr = "legal";
  await page.locator('[data-testid="me-legal"]').scrollIntoViewIfNeeded();
  await enter(page, "me-legal", "legal");
  await page.waitForSelector('[data-testid="legal-doc-terms"]', { timeout: 20000 }); await settle(page);
  await frame(page, scr, S);
  compare(scr, "changed banner", shapeOf(sh[2]), await box(page, '[data-testid="legal-changed"]'));
  for (let i = 0; i < 3; i++) {
    compare(scr, `doc ${i + 1}`, shapeOf(sh[3 + 2 * i]), await box(page, ".me-list .me-row", i));
    compare(scr, `doc ${i + 1} icon`, shapeOf(sh[4 + 2 * i]), await box(page, ".me-list .me-row-icon", i));
  }
  compare(scr, "check box", shapeOf(sh[9]), await box(page, ".me-agree .reg-box"));
  left(scr, "banner line 1", S.lines[1], await line(page, '[data-testid="legal-changed"] p', 0, 0));
  left(scr, "banner line 2", S.lines[2], await line(page, '[data-testid="legal-changed"] p', 0, 1));
  left(scr, "terms", S.lines[3], await line(page, ".me-list .me-row-name", 0));
  left(scr, "terms changed", S.lines[4], await line(page, ".me-list .me-row-sub", 0));
  right(scr, "terms date", S.lines[5], await line(page, ".me-list .me-row-value", 0));
  left(scr, "privacy", S.lines[6], await line(page, ".me-list .me-row-name", 1));
  right(scr, "privacy date", S.lines[7], await line(page, ".me-list .me-row-value", 1));
  left(scr, "rules", S.lines[8], await line(page, ".me-list .me-row-name", 2));
  right(scr, "rules date", S.lines[9], await line(page, ".me-list .me-row-value", 2));
  left(scr, "agree", S.lines[10], await line(page, ".me-agree > span:last-child"));
  note((await page.getAttribute('[data-testid="legal-doc-terms"]', "data-changed")) === "yes" && (await page.getAttribute('[data-testid="legal-doc-privacy"]', "data-changed")) === "no", "legal: the terms are marked changed, privacy not");
  note((await page.getAttribute('[data-testid="legal-accept"]', "aria-disabled")) === "true", "legal: Accept stays shut until the box is ticked");
  await fonts(page, scr, [["row", ".me-row-name"], ["banner", '[data-testid="legal-changed"] p']]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  // walk: ticked and accepted — POST /legal/accept for the terms' new hash, back to Me (which reads the statements
  // again: from here the node keeps one, for w4_statements; the w4_me sheet has none)
  stub.s.restricted = true;
  const acceptsBefore = stub.accepts.length;
  await page.check('[data-testid="legal-agree"]'); await page.click('[data-testid="legal-accept"]');
  await page.waitForSelector('[data-screen="me"]', { timeout: 20000 }).catch(() => null);
  const sent = stub.accepts.slice(acceptsBefore);
  note(sent.length === 1 && sent[0].document === "terms" && sent[0].revision_sha256 === "sha-terms-2" && (await page.locator('[data-screen="me"]').count()) === 1, `walk: Accept sends POST /legal/accept ${JSON.stringify(sent)} and returns to Me`);
}

// w4_statements (the row shows while the node keeps one)
if (want("statements")) {
  const S = sheet("statements"), sh = S.shapes, scr = "statements";
  await enter(page, "me-statements", "statements");
  await page.waitForSelector('[data-testid="statement"]', { timeout: 20000 }); await settle(page);
  await frame(page, scr, S);
  compare(scr, "banner", shapeOf(sh[2]), await box(page, ".me-statement .me-banner"));
  // The facts and the ground are prose (5ef374bf, parts.tsx Pairs "prose"): the value wraps under its label, so those
  // rows are taller than the sheet's one-line rows. Of a prose row only the row's top and its label's left edge and
  // baseline are compared; whatever stands below is expected lower by what the prose rows measured over the sheet's.
  const rowH = sh[4].y - sh[3].y;
  const prose = await page.locator(".me-pairs div").evaluateAll((els) => els.map((e) => e.classList.contains("me-pair--prose")));
  let grown = 0;
  for (let i = 0; i < 4; i++) {
    const b = await box(page, ".me-pairs div", i);
    compare(scr, `hairline ${i + 1} (x,y,w)`, [sh[3 + i].x, sh[3 + i].y + grown, sh[3 + i].w], b.slice(0, 3));
    const lab = S.lines[3 + 2 * i];
    left(scr, `label ${i + 1}`, { ...lab, base: lab.base + grown }, await line(page, ".me-pairs dt", i));
    if (!prose[i]) right(scr, `value ${i + 1}`, { ...S.lines[4 + 2 * i], base: S.lines[4 + 2 * i].base + grown }, await line(page, ".me-pairs dd", i));
    if (prose[i]) grown += b[3] - rowH;
  }
  note(prose.filter(Boolean).length === 2 && prose[0] && prose[1], `statements: the facts and the ground are the prose rows (${prose.join(",")}); rows below expected ${grown.toFixed(1)} px lower`);
  compare(scr, "appeal", [sh[7].x, sh[7].y + grown, sh[7].w, sh[7].h], await box(page, '[data-testid="statements-appeal"]'));
  left(scr, "banner title", S.lines[1], await line(page, ".me-statement .me-banner strong"));
  left(scr, "banner text", S.lines[2], await line(page, ".me-statement .me-banner p"));
  left(scr, "appeal label", { ...S.lines[11], base: S.lines[11].base + grown }, await line(page, '[data-testid="statements-appeal"] span'));
  await overflowAt(page, scr, 390); await shot(page, scr);
  await page.click('[data-testid="statements-appeal"]');
  note(await page.locator('[data-testid="statements-ways"]').isVisible(), "walk: Appeal opens the ways to appeal");
  await leave(page, "statements");
}

// w4_step-away
if (want("step-away")) {
  const S = sheet("step-away"), sh = S.shapes, scr = "step-away";
  await enter(page, "me-away", "step-away");
  note((await page.getAttribute('[data-testid="away-go"]', "aria-disabled")) === "true", "step-away: nothing chosen at first, Step away shut (§8.2)");
  await page.click('[data-testid="away-hour"]');
  await page.waitForFunction(() => !document.querySelector('[data-testid="away-price"]')?.textContent?.includes("…"), null, { timeout: 20000 }); await settle(page);
  await frame(page, scr, S);
  for (let i = 0; i < 3; i++) compare(scr, `chip ${i + 1}`, shapeOf(sh[2 + i]), await box(page, ".me-chip", i));
  for (let i = 0; i < 3; i++) compare(scr, `hairline ${i + 1} (x,y,w)`, [sh[5 + i].x, sh[5 + i].y, sh[5 + i].w], (await box(page, ".me-pairs div", i)).slice(0, 3));
  await cta(page, scr, S, 8, 14);
  left(scr, "title", S.lines[1], await line(page, ".me-title"));
  left(scr, "lead line 1", S.lines[2], await line(page, ".me-lead", 0, 0));
  left(scr, "lead line 2", S.lines[3], await line(page, ".me-lead", 0, 1));
  left(scr, "for", S.lines[4], await line(page, ".me-body .reg-field label"));
  for (let i = 0; i < 3; i++) left(scr, `chip ${i + 1} label`, S.lines[5 + i], await line(page, ".me-chip", i));
  for (let i = 0; i < 3; i++) {
    left(scr, `label ${i + 1}`, S.lines[8 + 2 * i], await line(page, ".me-pairs dt", i));
    right(scr, `value ${i + 1}`, S.lines[9 + 2 * i], await line(page, ".me-pairs dd", i));
  }
  const price = await page.locator('[data-testid="away-price"]').innerText();
  note(/2/.test(price) && /5/.test(price) && /3/.test(price), `step-away: the price counted from the node (2 phrases, 5 likes, 3 talks): "${price.replace(/\n/g, " ")}"`);
  await fonts(page, scr, [["title", ".me-title"], ["chip", ".me-chip"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  await page.click('[data-testid="away-go"]'); await page.waitForSelector('[data-screen="me"]', { timeout: 20000 }).catch(() => null);
  note(stub.s.away === "hour", `walk: Step away sends POST /away span=${stub.s.away}`);
}

// w4_age-filter
if (want("age-filter")) {
  const S = sheet("age-filter"), sh = S.shapes, scr = "age-filter";
  await enter(page, "me-filter", "age-filter"); await settle(page);
  await frame(page, scr, S);
  compare(scr, "card", shapeOf(sh[2]), await box(page, ".me-filter"));
  const tr = await box(page, ".me-track");
  compare(scr, "track", shapeOf(sh[3]), [tr[0], tr[1] + (tr[3] - sh[3].h) / 2, tr[2], sh[3].h]);
  compare(scr, "fill", shapeOf(sh[4]), await box(page, ".me-fill"));
  compare(scr, "knob from", shapeOf(sh[5]), await box(page, ".me-knob", 0));
  compare(scr, "knob to", shapeOf(sh[7]), await box(page, ".me-knob", 1));
  const inner = (b) => [b[0] + 4, b[1] + 4, b[2] - 8, b[3] - 8];
  compare(scr, "knob from lime", shapeOf(sh[6]), inner(await box(page, ".me-knob", 0)));
  compare(scr, "knob to lime", shapeOf(sh[8]), inner(await box(page, ".me-knob", 1)));
  left(scr, "title", S.lines[1], await line(page, ".me-title"));
  left(scr, "lead", S.lines[2], await line(page, ".me-lead"));
  left(scr, "from", S.lines[3], await line(page, ".me-ends span", 0));
  right(scr, "to", S.lines[4], await line(page, ".me-ends span", 1));
  left(scr, "note", S.lines[5], await line(page, ".me-filter-note"));
  await fonts(page, scr, [["title", ".me-title"], ["ends", ".me-ends span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  // walk: a handle moved by the keyboard; once it rests the pair goes to the node
  const before = stub.patches.length;
  await page.focus('[data-testid="filter-to"]'); await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1500);
  note(JSON.stringify(stub.patches.slice(before)) === '[{"filter_age_min":25,"filter_age_max":36}]', `walk: the "to" handle moved by a year sends ${JSON.stringify(stub.patches.slice(before))}`);
  await leave(page, "age-filter");
}

// w4_me-reset (last: it closes the identity)
if (want("me-reset")) {
  const S = sheet("me-reset"), sh = S.shapes, scr = "me-reset";
  await page.locator('[data-testid="me-reset"]').scrollIntoViewIfNeeded();
  await enter(page, "me-reset", "reset");
  await page.waitForFunction(() => !document.querySelector('[data-testid="reset-price"]')?.textContent?.includes("…"), null, { timeout: 20000 });
  await page.fill('[data-testid="reset-pin"]', "271828"); await page.locator('[data-testid="reset-pin"]').blur(); await settle(page);
  await frame(page, scr, S);
  compare(scr, "coral banner", shapeOf(sh[2]), await box(page, '[data-testid="reset-warning"]'));
  compare(scr, "yellow banner", shapeOf(sh[3]), await box(page, '[data-testid="reset-code"]'));
  for (let i = 0; i < 2; i++) compare(scr, `hairline ${i + 1} (x,y,w)`, [sh[4 + i].x, sh[4 + i].y, sh[4 + i].w], (await box(page, ".me-pairs div", i)).slice(0, 3));
  const cells = await boxOf(page, ".me-body .reg-cell"), dots = await boxOf(page, ".me-body .reg-cell i");
  [6, 8, 10, 12, 14, 16].forEach((s, i) => compare(scr, `cell ${i + 1}`, shapeOf(sh[s]), cells[i] ?? NAN4));
  [7, 9, 11, 13, 15, 17].forEach((s, i) => compare(scr, `dot ${i + 1}`, shapeOf(sh[s]), dots[i] ?? NAN4));
  compare(scr, "primary", shapeOf(sh[18]), await box(page, ".me-foot .cta"));
  left(scr, "primary label", S.lines[9], await line(page, ".me-foot .cta span"));
  left(scr, "banner title", S.lines[1], await line(page, '[data-testid="reset-warning"] strong'));
  left(scr, "banner text", S.lines[2], await line(page, '[data-testid="reset-warning"] p'));
  left(scr, "yellow text", S.lines[3], await line(page, '[data-testid="reset-code"] p'));
  left(scr, "phrases", S.lines[4], await line(page, ".me-pairs dt", 0));
  right(scr, "phrases value", S.lines[5], await line(page, ".me-pairs dd", 0));
  left(scr, "talks", S.lines[6], await line(page, ".me-pairs dt", 1));
  right(scr, "talks value", S.lines[7], await line(page, ".me-pairs dd", 1));
  left(scr, "PIN label", S.lines[8], await line(page, ".me-body .reg-field label"));
  await fonts(page, scr, [["banner", '[data-testid="reset-warning"] strong'], ["primary", ".me-foot .cta span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  // walk: Close it for good — POST /identities/close, this device forgets, the splash
  await page.click('[data-testid="reset-go"]'); await page.waitForSelector('[data-screen="splash"]', { timeout: 60000 }).catch(() => null);
  const left_ = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("xor-vault"); r.onsuccess = () => { const db = r.result; if (![...db.objectStoreNames].includes("identity")) return res("no store"); const g = db.transaction("identity").objectStore("identity").get("me"); g.onsuccess = () => res(g.result ? "kept" : "gone"); }; r.onerror = () => res("error"); }));
  note(stub.s.closed && (await page.locator('[data-screen="splash"]').count()) === 1 && left_ === "gone", `walk: Close it for good calls POST /identities/close, the record is ${left_}, the splash opens`);
}
const odd = stub.calls.filter((c) => c.startsWith("UNEXPECTED"));
note(odd.length === 0, `node calls outside the stub: ${odd.length ? odd.join(", ") : "none"}`);
await ctx.close();
await browser.close();

// ── report ──
if (rows.length) {
  const wN = Math.max(...rows.map((r) => r.name.length)), wE = Math.max(...rows.map((r) => r.exp.length)), wA = Math.max(...rows.map((r) => r.act.length));
  console.log(`${"screen".padEnd(12)} ${"element".padEnd(wN)}  ${"expected".padEnd(wE)}  ${"actual".padEnd(wA)}  ${"delta".padEnd(20)} ok`);
  console.log(`(box = left,top,width,height; text = left or right,baseline; px; locale ${LOCALE}; tolerance ${TOL} px)`);
  for (const r of rows) console.log(`${r.screen.padEnd(12)} ${r.name.padEnd(wN)}  ${r.exp.padEnd(wE)}  ${r.act.padEnd(wA)}  ${r.delta.padEnd(20)} ${r.ok ? "ok" : "NO"}`);
  const per = {};
  for (const r of rows) { per[r.screen] ??= [0, 0]; per[r.screen][1]++; if (r.ok) per[r.screen][0]++; }
  console.log(`per sheet: ${Object.entries(per).map(([s, [g, n]]) => `${s} ${g}/${n}`).join("; ")}`);
}
for (const n of notes) console.log(`${n.bad ? "DEFECT" : "ok    "} ${n.text}`);
console.log(csp.length ? `DEFECT console/CSP errors (${csp.length}): ${[...new Set(csp)].slice(0, 8).join(" | ")}` : "ok     console/CSP errors: none");
const good = rows.filter((r) => r.ok).length;
const clean = !notes.some((n) => n.bad) && !csp.length;
console.log(GEOMETRY ? `measure-app-w4: ${good} of ${rows.length} within ${TOL}px; notes ${clean ? "clean" : "DEFECTS"}` : `measure-app-w4[${TAG}]: fonts, overflow, walks, CSP ${clean ? "clean" : "DEFECTS"}`);
process.exit(good === rows.length && clean ? 0 : 1);
