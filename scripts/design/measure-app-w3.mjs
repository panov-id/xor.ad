// Measures the rendered app/ tables and the new-table wizard against the Dusk sheets of wave 3 (mobile w3_tables,
// w3_new-table-1, w3_new-table-2, w3_new-table-3), and walks what they do against a stubbed node (the list and its
// cursor, «My tables», the empty and the failed list, the wizard's three steps, POST /tables with its body, a refused
// name, a refused call). Run by scripts/measure-app-w3.sh inside the Playwright image, on an internal network: PREVIEW is
// the built app (with its CSP) in the container called `app`.
//
// Expected values are read from the sheets (sheet-geometry.mjs), never typed in; indices are the sheets' drawing
// order (shape 0 is the night). Per element: left/top/width/height of the box against the shape; per text line:
// the left edge (or the right edge of a right-aligned value) and the baseline against the sheet's ink. The sheets' canvas
// is 388 wide in a 390 viewport: the sheet panel is compared by its left/top only.
// Not compared: the search icon of the list's header (this shell has no search), the chats tab's red dot (this shell does
// not know unread talks), the width of the variant chip (the sheet's «Long» is not a word of the node: the chip says
// «Backgammon»), the second chips of «Variant» («Short») and «Seats» («2 + watchers»), which the node cannot play, the words
// inside the name input (the DOM has no text node for them), and the break of the preview's sub-line (the words differ).
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
const sheet = (n) => readSheet(`${SHEETS}/w3_${n}.svg`);

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


// ── the node, stubbed: the routes the registration, the feed and the tables call ──
const NODE_PATH = /^\/(identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|statements|likes|inbox|away|tables)(\/|$)/;
const ACCEPTED = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
// w3_tables: four tables, as the sheet lists them (backgammon 2 of 2 and 3 watching, durak 3 of 4, chess 1 of 2, dominoes 2 of 4).
const CARDS = [
  { id: "t1", game: "dice", set: "backgammon", playing: 2, free_seats: 0, watching: 3, like_count: 0 },
  { id: "t2", game: "deck", set: "36", playing: 3, free_seats: 1, watching: 1, like_count: 0 },
  { id: "t3", game: "grid", set: "chess", playing: 1, free_seats: 1, watching: 0, like_count: 0 },
  { id: "t4", game: "free", set: "double-six", playing: 2, free_seats: 2, watching: 2, like_count: 0 },
];
function nodeStub() {
  const calls = [], creates = [], lists = [];
  const s = { share: null, pinAuth: null, items: CARDS, mine: [], next: null, page2: [], listStatus: 200, createStatus: 201, createBody: { id: "new-1" } };
  const prepare = async (ctx) => {
    await ctx.route("**/*", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
      const key = `${req.method()} ${u.pathname}`; calls.push(key);
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() ?? "{}");
      if (key === "GET /legal/manifest") return json(200, { documents: ACCEPTED });
      if (key === "POST /legal/accept") return json(200, {});
      if (key === "POST /identities") { s.share = body().share; s.pinAuth = null; return json(200, { identity_id: "id-stub", session_id: "sess-stub" }); }
      if (key === "POST /vault/share") {
        const auth = body().auth;
        if (s.pinAuth === null) { s.pinAuth = auth; return json(200, { share: s.share }); }
        return auth === s.pinAuth ? json(200, { share: s.share }) : json(409, { error: { code: "pin_mismatch", attempts_left: 9 } });
      }
      if (key === "GET /identities/me") return json(200, { name: "Alex", name_state: "accepted", age: 32, phrases: [], filter_age_min: 25, filter_age_max: 35 });
      if (key === "GET /feed") return json(200, { items: [], next: null });
      if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
      if (key === "GET /tables") {
        lists.push(u.search);
        if (s.listStatus !== 200) return json(s.listStatus, { error: { code: "unavailable" } });
        if (u.searchParams.get("after")) return json(200, { items: s.page2, next: null });
        return json(200, { items: s.items, next: s.next, mine: s.mine });
      }
      if (key === "POST /tables") { creates.push(body()); return json(s.createStatus, s.createBody); }
      calls.push(`UNEXPECTED ${key}`); return route.abort();
    });
  };
  return { calls, creates, lists, s, prepare };
}

async function open(browser, url, width, { screen, prepare }) {
  const h = width === 390 ? 844 : width === 834 ? 1194 : 900;
  const ctx = await browser.newContext({ viewport: { width, height: h }, deviceScaleFactor: 1, locale: LOCALE, isMobile: width < 768, hasTouch: width < 768, bypassCSP: !!OVERRIDE });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("lang-asked", "1"); } catch {}
    // a place chosen before (the web's key, the web's shape): the tables are looked for around it
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
const shot = async (page, n) => { if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/w3_${n}.png` }); };


// ── run ──
const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });
for (let i = 0; ; i++) {
  try { if ((await fetch(PREVIEW)).ok) break; } catch {}
  if (i > 120) { console.log(`measure-app-w3: SPOILED (${PREVIEW} never answered)`); process.exit(2); }
  await new Promise((r) => setTimeout(r, 1000));
}

const stub = nodeStub();
const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: "w3", prepare: stub.prepare });
await registerFull(page);
const path = () => new URL(page.url()).pathname;
const toTables = async () => { await page.click('[data-testid="tab-tables"]'); await page.waitForSelector('[data-screen="tables"]', { timeout: 20000 }); };
const toFeed = async () => { await page.click('[data-testid="tab-feed"]'); await page.waitForSelector('[data-screen="feed"]', { timeout: 20000 }).catch(async (e) => { console.log(`DIAG toFeed: ${page.url()} screens=${await page.locator('[data-screen]').evaluateAll((l) => l.map((x) => x.dataset.screen))}`); throw e; }); };
const bars = async (page, scr, S, firstBar) => { for (let i = 0; i < 3; i++) compare(scr, `step bar ${i + 1}`, shapeOf(S.shapes[firstBar + i]), await box(page, ".nt-steps .reg-bars span", i)); };
const head = async (page, scr, S) => {
  left(scr, "title", S.lines[0], await line(page, ".mv-title"));
  left(scr, "step words", S.lines[1], await line(page, ".nt-steps .reg-step"));
};
await toTables();
await page.waitForSelector('[data-testid="table-card"]');
note(path() === "/tables", `walk: the tab bar's «tables» opens the list at ${path()}`);
note((await page.locator('[data-testid="tab-tables"]').getAttribute("aria-disabled")) === null, "walk: the tables tab is open (no aria-disabled)");
note(stub.lists.length === 1 && /radius=1000/.test(stub.lists[0]) && /lat=41\.689/.test(stub.lists[0]) && /lon=44\.8/.test(stub.lists[0]), `walk: GET /tables asks the place's circle: ${stub.lists[0]}`);

// w3_tables
if (want("tables")) {
  const S = sheet("tables"), sh = S.shapes, scr = "tables";
  await settle(page);
  compare(scr, "sheet left,top", [sh[1].x, sh[1].y], (await box(page, ".tb-sheet")).slice(0, 2));
  compare(scr, "new table", shapeOf(sh[2]), await box(page, ".tb-new"));
  for (let i = 0; i < 4; i++) {
    const r = 3 + 3 * i;
    compare(scr, `row ${i + 1}`, shapeOf(sh[r]), await box(page, '[data-testid="table-card"]', i));
    compare(scr, `row ${i + 1} face`, shapeOf(sh[r + 1]), await box(page, '[data-testid="table-card"] .tb-face', i));
    compare(scr, `row ${i + 1} watch`, shapeOf(sh[r + 2]), await box(page, '[data-testid="table-card"] .tb-watch', i));
  }
  compare(scr, "tab bar", shapeOf(sh[15]), await box(page, ".tabbar"));
  compare(scr, "tab tables (lime)", shapeOf(sh[16]), await box(page, '.tab[aria-current="page"]'));
  left(scr, "brand word", S.lines[0], await line(page, ".tb-head .word"));
  left(scr, "title", S.lines[1], await line(page, ".tb-head h1"));
  left(scr, "sub", S.lines[2], await line(page, ".tb-sub"));
  left(scr, "new table label", S.lines[3], await line(page, ".tb-new span"));
  for (let i = 0; i < 4; i++) {
    const t = 4 + 3 * i;
    left(scr, `row ${i + 1} name`, S.lines[t], await line(page, '[data-testid="table-card"] .tb-name', i));
    left(scr, `row ${i + 1} meta`, S.lines[t + 1], await line(page, '[data-testid="table-card"] .tb-meta', i));
    left(scr, `row ${i + 1} watch label`, S.lines[t + 2], await line(page, '[data-testid="table-card"] .tb-watch', i));
  }
  const names = await page.locator('[data-testid="table-card"] .tb-name').allInnerTexts();
  const metas = await page.locator('[data-testid="table-card"] .tb-meta').allInnerTexts();
  note(RU || (names.join(",") === "Backgammon,Durak,Chess,Dominoes" && metas[0] === "2 of 2 seated · 3 watching" && metas[1] === "3 of 4 seated · 1 watching"), `tables: the rows read ${names.join(", ")}; ${metas.join(" | ")}`);
  note(!RU || (metas[0] === "2 из 2 сидят · 3 смотрят" && metas[1] === "3 из 4 сидят · 1 смотрит" && metas[2] === "1 из 2 сидит · 0 смотрят"), `tables: the rows read ${metas.join(" | ")}`);
  note(RU || (await page.locator('[data-testid="table-card"] .tb-watch').first().getAttribute("aria-disabled")) === "true", "tables: «Watch» is shut while no table screen opens from it (aria-disabled)");
  await fonts(page, scr, [["title", ".tb-head h1"], ["row", ".tb-name"], ["meta", ".tb-meta"], ["new", ".tb-new span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}

// the list's other states
if (want("tables")) {
  const scr = "tables";
  // «My tables»: where the person sits, above the list, and never twice
  stub.s.mine = [{ ...CARDS[1], seated: true }]; stub.s.items = CARDS;
  await toFeed(); await toTables(); await page.waitForSelector('[data-testid="table-mine"]');
  const mineCount = await page.locator('[data-testid="table-mine"]').count(), listCount = await page.locator('[data-testid="table-card"]').count();
  note(mineCount === 1 && listCount === 3, `walk: a table the person sits at stands in «My tables» (${mineCount}) and not again in the list (${listCount} of 4 left)`);
  await overflowAt(page, "tables-mine", 390);
  stub.s.mine = [];
  // the cursor: «Show more» brings the next page, a table seen twice is drawn once
  stub.s.next = "c1"; stub.s.page2 = [CARDS[3], { id: "t5", game: "grid", set: "reversi", playing: 1, free_seats: 1, watching: 0, like_count: 0, name: "Evening at the yard" }];
  await toFeed(); await toTables(); await page.waitForSelector('[data-testid="more"]');
  await page.click('[data-testid="more"]'); await page.waitForFunction(() => document.querySelectorAll('[data-testid="table-card"]').length === 5, null, { timeout: 20000 }).catch(() => null);
  const after = await page.locator('[data-testid="table-card"] .tb-name').allInnerTexts();
  note(after.length === 5 && after[4] === "Evening at the yard", `walk: «more» adds the next page without a table twice: ${after.join(", ")}`);
  const named = await page.locator('[data-testid="table-card"] .tb-meta').last().innerText();
  note(RU || named === "Reversi · 1 of 2 seated · 0 watching", `tables: a named table says its game first: «${named}»`);
  stub.s.next = null; stub.s.page2 = [];
  // the empty list
  stub.s.items = [];
  await toFeed(); await toTables(); await page.waitForSelector('[data-testid="quiet"]');
  note(RU || (await page.locator('[data-testid="quiet"] h2').innerText()) === "No tables nearby yet", "walk: no tables nearby says so, the new-table button stays above");
  note((await page.locator('[data-testid="new-table"]').count()) === 1, "walk: an empty list still has «New table»");
  await overflowAt(page, "tables-empty", 390);
  // the failed list: a banner with its own words (never the node's), «Again» brings the list back
  stub.s.items = CARDS; stub.s.listStatus = 503;
  await toFeed(); await toTables(); await page.waitForSelector('[data-testid="error"]');
  const errText = await page.locator('[data-testid="error"]').innerText();
  note(!/503|unavailable|refused/.test(errText), `walk: a failed list says it in words, not with the node's status: «${errText.replace(/\n/g, " ")}»`);
  stub.s.listStatus = 200;
  await page.click('[data-testid="retry"]'); await page.waitForSelector('[data-testid="table-card"]');
  note((await page.locator('[data-testid="error"]').count()) === 0, "walk: «Again» brings the list back and the banner goes");
  await shot(page, "tables-failed");
}

// w3_new-table-1
await page.click('[data-testid="new-table"]'); await page.waitForSelector('[data-screen="new-table"]', { timeout: 20000 });
note(path() === "/tables/new", `walk: «New table» opens the wizard at ${path()}`);
note((await page.locator('.nt-foot .cta').getAttribute("aria-disabled")) === "true", "walk: «Next» is shut until a game is picked");
if (want("new-table-1")) {
  const S = sheet("new-table-1"), sh = S.shapes, scr = "new-table-1";
  await page.click('[data-testid="new-table-game-backgammon"]'); await settle(page);
  await bars(page, scr, S, 1);
  compare(scr, "sheet left,top", [sh[4].x, sh[4].y], (await box(page, ".nt-sheet")).slice(0, 2));
  for (let i = 0; i < 12; i++) compare(scr, `game ${i + 1}`, shapeOf(sh[5 + i + (i >= 6 ? 1 : 0)]), await box(page, ".nt-game", i));
  compare(scr, "picked game ring", shapeOf(sh[11]), await box(page, '.nt-game[aria-checked="true"]'));
  compare(scr, "next", shapeOf(sh[18]), await box(page, ".nt-foot .cta"));
  await head(page, scr, S);
  left(scr, "pick a game", S.lines[2], await line(page, ".nt-title"));
  for (let r = 0; r < 4; r++) left(scr, `row ${r + 1} first name`, S.lines[3 + r], await line(page, ".nt-game-name", 3 * r));
  left(scr, "next label", S.lines[7], await line(page, ".nt-foot .cta span"));
  const picked = await page.locator('.nt-game[aria-checked="true"]').getAttribute("data-testid");
  note(picked === "new-table-game-backgammon" && (await page.locator('.nt-foot .cta').getAttribute("aria-disabled")) === null, `walk: a tap picks the game (${picked}) and opens «Next»`);
  await fonts(page, scr, [["title", ".nt-title"], ["game", ".nt-game-name"], ["next", ".nt-foot .cta span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}

// w3_new-table-2
await page.click('[data-testid="new-table-next"]'); await page.waitForSelector('.nt[data-step="2"]', { timeout: 20000 });
await page.fill('[data-testid="new-table-name"]', "Evening at the yard");
if (want("new-table-2")) {
  const S = sheet("new-table-2"), sh = S.shapes, scr = "new-table-2";
  await page.locator('[data-testid="new-table-name"]').blur(); await settle(page);
  await bars(page, scr, S, 1);
  compare(scr, "sheet left,top", [sh[4].x, sh[4].y], (await box(page, ".nt-sheet")).slice(0, 2));
  const v = await box(page, '[data-testid="new-table-set-backgammon"]');
  compare(scr, "variant chip left,top,height", [sh[5].x, sh[5].y, sh[5].h], [v[0], v[1], v[3]]);
  compare(scr, "seats chip", shapeOf(sh[7]), await box(page, '[data-testid="new-table-seats-2"]'));
  compare(scr, "name field", shapeOf(sh[9]), await box(page, ".reg-input"));
  compare(scr, "preview", shapeOf(sh[10]), await box(page, ".nt-foot .cta"));
  await head(page, scr, S);
  left(scr, "game title", S.lines[2], await line(page, ".nt-title"));
  left(scr, "lead", S.lines[3], await line(page, ".nt-lead"));
  left(scr, "variant label", S.lines[4], await line(page, ".nt-body .reg-field label", 0));
  left(scr, "variant chip text", S.lines[5], await line(page, '[data-testid="new-table-set-backgammon"]'));
  left(scr, "seats label", S.lines[7], await line(page, ".nt-body .reg-field label", 1));
  left(scr, "seats chip text", S.lines[8], await line(page, '[data-testid="new-table-seats-2"]'));
  left(scr, "name label", S.lines[10], await line(page, ".nt-body .reg-field label", 2));
  right(scr, "counter", S.lines[12], await line(page, ".reg-counter"));
  left(scr, "preview label", S.lines[13], await line(page, ".nt-foot .cta span"));
  note(RU || (await page.locator(".reg-counter").innerText()) === "5 of 24 left", `walk: the name counts its letters: «${await page.locator(".reg-counter").innerText()}»`);
  note((await page.locator('[data-testid="new-table-set"] .me-chip').count()) === 1 && (await page.locator('[data-testid="new-table-seats"] .me-chip').count()) === 1, "walk: backgammon offers the one variant and the one seat count the node plays");
  await fonts(page, scr, [["title", ".nt-title"], ["chip", ".me-chip"], ["label", ".reg-field label"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}

// w3_new-table-3
await page.click('[data-testid="new-table-next"]'); await page.waitForSelector('.nt[data-step="3"]', { timeout: 20000 });
if (want("new-table-3")) {
  const S = sheet("new-table-3"), sh = S.shapes, scr = "new-table-3";
  await settle(page);
  await bars(page, scr, S, 1);
  compare(scr, "sheet left,top", [sh[4].x, sh[4].y], (await box(page, ".nt-sheet")).slice(0, 2));
  compare(scr, "table row", shapeOf(sh[5]), await box(page, ".tb-row"));
  compare(scr, "table face", shapeOf(sh[6]), await box(page, ".tb-face"));
  compare(scr, "table watch", shapeOf(sh[7]), await box(page, ".tb-watch"));
  compare(scr, "sit", shapeOf(sh[8]), await box(page, ".nt-foot .cta"));
  await head(page, scr, S);
  left(scr, "title", S.lines[2], await line(page, ".nt-title"));
  left(scr, "table name", S.lines[3], await line(page, ".tb-name"));
  left(scr, "table meta 1", S.lines[4], await line(page, ".tb-meta", 0, 0));
  left(scr, "table meta 2", S.lines[5], await line(page, ".tb-meta", 0, 1));
  left(scr, "watch label", S.lines[6], await line(page, ".tb-watch"));
  left(scr, "hint", S.lines[7], await line(page, ".nt-hint"));
  left(scr, "sit label", S.lines[8], await line(page, ".nt-foot .cta span"));
  const meta = await page.locator(".tb-meta").innerText();
  note(RU || (/^Backgammon · 1 of 2 seated · 0\s*watching$/.test(meta.replace(/\n/g, " "))), `new-table-3: the preview says what the list will: «${meta.replace(/\n/g, " ")}»`);
  await fonts(page, scr, [["title", ".nt-title"], ["name", ".tb-name"], ["sit", ".nt-foot .cta span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
}

// what the wizard does
{
  // a refused call keeps the person on step 3 with a line in words; «Sit at the table» again, accepted: POST /tables with the node's fields
  stub.s.createStatus = 503; stub.s.createBody = { error: { code: "unavailable", message: "db down" } };
  await page.click('[data-testid="new-table-go"]'); await page.waitForSelector('[data-testid="error"]');
  const refused = await page.locator('[data-testid="error"]').innerText();
  note(!/db down|unavailable/.test(refused) && (await page.locator('.nt[data-step="3"]').count()) === 1, `walk: a refused table stays on step 3 with words, not the node's text: «${refused}»`);
  stub.s.createStatus = 201; stub.s.createBody = { id: "new-1" };
  await page.click('[data-testid="new-table-go"]'); await page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  const body = { ...stub.creates[stub.creates.length - 1] }; delete body.nonce;
  note(JSON.stringify(body) === JSON.stringify({ class: "dice", set: "backgammon", seats: 2, lat: 41.689, lon: 44.8, area_radius: 1000, name: "Evening at the yard" }), `walk: «Sit at the table» sends ${JSON.stringify(body)}`);
  note(path() === "/tables", `walk: a made table lands on the list at ${path()}`);
  // a refused name: back to step 2, where the name is typed
  stub.s.createStatus = 422; stub.s.createBody = { error: { code: "name_refused", message: "the model says no" } };
  await page.click('[data-testid="new-table"]'); await page.waitForSelector('[data-screen="new-table"]');
  await page.click('[data-testid="new-table-game-dots"]'); await page.click('[data-testid="new-table-next"]');
  await page.click('[data-testid="new-table-set-4x4"]'); await page.fill('[data-testid="new-table-name"]', "Nope");
  await page.click('[data-testid="new-table-next"]'); await page.click('[data-testid="new-table-go"]');
  await page.waitForSelector('.nt[data-step="2"] [data-testid="error"]', { timeout: 20000 });
  const nameLine = await page.locator('[data-testid="error"]').innerText();
  note(!/model says no|name_refused/.test(nameLine) && (await page.locator('[data-testid="new-table-set-4x4"]').getAttribute("aria-checked")) === "true", `walk: a refused name sends the person back to the name (step 2, the variant kept): «${nameLine}»`);
  // Back: the step before, from step 1 out to the list; the system's Back leaves the wizard
  await page.click('[data-testid="new-table-back"]'); await page.waitForSelector('.nt[data-step="1"]');
  await page.click('[data-testid="new-table-back"]'); await page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  note(path() === "/tables", `walk: Back from step 1 is the list at ${path()}`);
  await page.click('[data-testid="new-table"]'); await page.waitForSelector('[data-screen="new-table"]');
  await page.goBack(); await page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  note(path() === "/tables", `walk: the system's Back out of the wizard is the list at ${path()}`);
  // a reload on the wizard's address is not the wizard: the PIN, or within the reload's grace the feed (a seat's address, as /me)
  await page.goto(PREVIEW + "/tables/new"); await page.waitForSelector('[data-screen="unlock"], [data-screen="feed"]', { timeout: 30000 }).catch(() => null);
  note((await page.locator('[data-screen="new-table"]').count()) === 0 && (await page.locator('[data-screen="unlock"], [data-screen="feed"]').count()) === 1, `walk: a reload at /tables/new opens no wizard but the PIN or the feed: ${path()}`);
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
console.log(GEOMETRY ? `measure-app-w3: ${good} of ${rows.length} within ${TOL}px; notes ${clean ? "clean" : "DEFECTS"}` : `measure-app-w3[${TAG}]: fonts, overflow, walks, CSP ${clean ? "clean" : "DEFECTS"}`);
process.exit(good === rows.length && clean ? 0 : 1);
