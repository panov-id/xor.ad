// Measures the rendered app/ table (the frame, then each game's board) against the Dusk sheets of wave 3 (mobile
// w3_table-four, w3_table-dots, w3_table-hangman, w3_table-reversi; more games as their boards come), and walks it against a stubbed node: the list's «Watch» opens the
// table, a column's tap sends the move. Run by scripts/measure-app-w3-games.sh inside the Playwright image, on an
// internal network: PREVIEW is the built app (with its CSP). Built on measure-app-w4.mjs (its helpers, its report).
// Expected values are read from the sheets (sheet-geometry.mjs), never typed in; indices are the sheets' drawing order.
// Not compared: the sticker chips' widths (the sheet's fourth chip «Backgammon?» is no sticker of the catalogue —
// depth/core/sticker.ts — and its first says «Hi!»): their left, top and height only; the yellow mark over a column.
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
      // the sticker chips scroll sideways by design (w3_table-*: four shown of eight): what is past the edge is scrolled to
      const scrolled = e.closest(".tb-chips") && !e.classList.contains("tb-chips");
      if (r.width && !scrolled && (r.right > vw + 0.5 || r.left < -0.5)) out.push(`${tag} outside the viewport: ${r.left.toFixed(1)}..${r.right.toFixed(1)} of ${vw}`);
      const clips = cs.overflowX !== "visible" || cs.textOverflow === "ellipsis";
      if (e.tagName !== "INPUT" && clips && e.scrollWidth > e.clientWidth + 1 && !e.classList.contains("me-body") && !e.classList.contains("tb-chips")) out.push(`${tag} clips horizontally: scrollWidth ${e.scrollWidth} > clientWidth ${e.clientWidth}`);
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


// ── the node, stubbed: registration, the list, one table of four in a row (the sheet's position) ──
const NODE_PATH = /^\/(identities|vault|recovery|legal|health|limits|feed|hidden|blocks|report|statements|likes|inbox|away|tables)(\/|$)/;
const ACCEPTED = ["terms", "privacy", "guidelines"].map((document) => ({ document, revision_date: "2026-01-01", revision_sha256: `sha-${document}`, reaccept: "none" }));
// w3_table-four: me (seat 1) lime, Nino (seat 2) peach; columns a..g, rows from the bottom.
const FOUR = { d4: 2, d3: 1, e3: 2, c2: 1, d2: 2, e2: 1, b1: 1, c1: 2, d1: 1, e1: 1 };
const cellsOf = (m) => Object.fromEntries(Object.entries(m).map(([id, seat]) => [id, { seat, piece: "O" }]));
// w3_table-dots: 4×4, two boxes mine (seat 1), two Nino's, two loose edges.
const DOTS = { edges: ["h:1:1", "h:2:1", "v:1:1", "v:1:2", "h:1:2", "h:2:2", "v:1:3", "h:3:1", "v:2:1", "v:2:2", "h:3:3", "h:4:3", "v:3:3", "v:3:4", "h:4:0", "v:0:4"],
  boxes: { "1:1": 1, "1:2": 1, "2:1": 2, "3:3": 2 } };
const GAMES = { t1: { class: "grid", set: "four" }, t2: { class: "dots", set: "4x4" }, t3: { class: "word", set: "en" }, t4: { class: "grid", set: "reversi" } };
// w3_table-reversi: mine lime, Nino peach (rank 8 on top).
const REVERSI = { d6: 1, e6: 2, c5: 2, d5: 2, e5: 1, d4: 1, e4: 2, f4: 2, e3: 1, f3: 1 };
// w3_table-hangman: Nino set the word, I guess; tried q e t a f k (the sheet's spent keys), the mask shows them.
const WORD = { setter: 2, set: "en", alphabet: [..."abcdefghijklmnopqrstuvwxyz"], word: null, mask: "ka__e__e__", guessed: ["q", "e", "t", "a", "f", "k"], misses: 3, misses_left: 3 };
function tableView(s, id) {
  const g = GAMES[id];
  const state = g.class === "dots" ? { dots: { n: 4, edges: [...s.edges], boxes: { ...DOTS.boxes } } }
    : g.class === "word" ? { word: { ...WORD, guessed: [...s.guessed] } }
    : g.set === "reversi" ? { grid: { cells: cellsOf(s.rev), claim: null, rules: "reversi" } }
    : { grid: { cells: cellsOf(s.cells), claim: null, rules: "four" } };
  return {
    id, class: g.class, set: g.set, seat: 1, is_playing: true, playing: 2, watching: 0, name: "Evening at the yard", like_count: 0, lines: [],
    seats: [{ seat: 1, name: "Alex", role: "playing" }, { seat: 2, name: "Nino", role: "playing" }],
    board: { seq: s.seq, state, turn: s.turn, score: {}, expires_at: s.due, pending: null },
  };
}
function nodeStub() {
  const calls = [], moves = [];
  const s = { share: null, pinAuth: null, seq: 7, turn: 1, cells: { ...FOUR }, edges: [...DOTS.edges], guessed: [...WORD.guessed], rev: { ...REVERSI }, due: Math.floor(Date.now() / 1000) + 100 };
  const prepare = async (ctx) => {
    await ctx.route("**/*", async (route) => {
      const req = route.request(), u = new URL(req.url());
      if (!["fetch", "xhr"].includes(req.resourceType()) || !NODE_PATH.test(u.pathname)) return route.fallback();
      const key = `${req.method()} ${u.pathname}`; calls.push(key);
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      const body = () => JSON.parse(req.postData() ?? "{}");
      if (key === "GET /legal/manifest") return json(200, { documents: ACCEPTED });
      if (key === "POST /legal/accept") return json(200, {});
      if (key === "POST /identities") { s.share = body().share; return json(200, { identity_id: "id-stub", session_id: "sess-stub" }); }
      if (key === "POST /vault/share") { const auth = body().auth; if (s.pinAuth === null) s.pinAuth = auth; return auth === s.pinAuth ? json(200, { share: s.share }) : json(409, { error: { code: "pin_mismatch", attempts_left: 9 } }); }
      if (key === "GET /identities/me") return json(200, { name: "Alex", name_state: "accepted", age: 32, phrases: [], filter_age_min: 25, filter_age_max: 35 });
      if (key === "GET /feed") return json(200, { items: [], next: null });
      if (key === "POST /recovery/confirm") return route.fulfill({ status: 204 });
      if (key === "GET /tables") return json(200, { items: Object.entries(GAMES).map(([id, g]) => ({ id, game: g.class, set: g.set, playing: 2, free_seats: 0, watching: 0, like_count: 0, name: "Evening at the yard" })), next: null, mine: [] });
      const t = /^\/tables\/(t\d)(\/.*)?$/.exec(u.pathname);
      if (t && req.method() === "GET" && !t[2]) return json(200, tableView(s, t[1]));
      if (t && t[2] === "/moves") {
        const m = body(); moves.push({ ...m, table: t[1] });
        if (m.move?.column) { const col = m.move.column; let r = 1; while (s.cells[`${col}${r}`]) r++; s.cells[`${col}${r}`] = 1; }
        if (m.move?.edge) s.edges.push(m.move.edge);
        if (m.move?.letter) s.guessed.push(m.move.letter);
        if (m.move?.to) s.rev[m.move.to] = 1;
        s.seq++; s.turn = 2;
        return json(200, { board: tableView(s, t[1]).board });
      }
      if (t && t[2] === "/ticket") return json(503, { error: { code: "unavailable" } });   // no room in the stub: the screen reads the view
      calls.push(`UNEXPECTED ${key}`); return route.abort();
    });
  };
  return { calls, moves, s, prepare };
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
const shot = async (page, n) => { if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/w3_${n}.png` }); };
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
  if (i > 120) { console.log(`measure-app-w3-games: SPOILED (${PREVIEW} never answered)`); process.exit(2); }
  await new Promise((r) => setTimeout(r, 1000));
}
const sheetOf = (n) => readSheet(`${SHEETS}/w3_table-${n}.svg`);
async function toTable(page, nth = 0) {
  await page.click('[data-testid="tab-tables"]'); await page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  await page.locator('[data-testid="table-open"]').nth(nth).click(); await page.waitForSelector('[data-screen="table"]', { timeout: 20000 });
  await page.locator(".tb-panel").first().waitFor({ timeout: 20000 });
}
// the frame every game's sheet shares
async function tableFrame(page, scr, S) {
  const sh = S.shapes, L = S.lines;
  compare(scr, "face left", shapeOf(sh[1]), await box(page, '[data-testid="face-left"]'));
  compare(scr, "face right", shapeOf(sh[2]), await box(page, '[data-testid="face-right"]'));
  compare(scr, "sheet left,top", [sh[3].x, sh[3].y], (await box(page, ".tb-sheet")).slice(0, 2));
  compare(scr, "panel left,top,width", [sh[4].x, sh[4].y, sh[4].w], (await box(page, ".tb-panel")).slice(0, 3));
  // the bar's and the faces' lines found by where they stand (the sheets draw them in different orders)
  const near = (x0, x1, b0, b1) => L.find((l) => l.left >= x0 && l.left <= x1 && l.base >= b0 && l.base <= b1);
  const title = L.filter((l) => l.base < 70 && l.left > 60 && l.left < 70);
  left(scr, "title line 1", title[0], await line(page, ".tb-bar h1", 0, 0));
  if (title[1]) left(scr, "title line 2", title[1], await line(page, ".tb-bar h1", 0, 1));
  left(scr, "face left letter", near(25, 50, 100, 112), await line(page, '[data-testid="face-left"]'));
  left(scr, "my line", near(60, 80, 100, 112), await line(page, ".tb-me"));
  left(scr, "face right letter", near(330, 360, 100, 112), await line(page, '[data-testid="face-right"]'));
  left(scr, "ring minutes", near(280, 310, 100, 112), await line(page, '[data-testid="move-ring"]'));
  const chips = sh.filter((x) => Math.abs(x.y - 778.8) < 1 && Math.abs(x.h - 39.8) < 1);
  for (let i = 0; i < 3; i++) { const b = await box(page, ".tb-chip", i); compare(scr, `chip ${i + 1} left,top,height`, [chips[i].x, chips[i].y, chips[i].h], [b[0], b[1], b[3]]); }
}

const stub = nodeStub();
const { ctx, page } = await open(browser, PREVIEW + "/", 390, { screen: "w3g", prepare: stub.prepare });
await registerFull(page);
await toTable(page);
note(new URL(page.url()).pathname === "/table" && stub.calls.includes("GET /tables/t1"), `walk: «Watch» opens the table at ${new URL(page.url()).pathname}, reading GET /tables/t1`);

// w3_table-four
if (want("four")) {
  const S = sheetOf("four"), sh = S.shapes, scr = "four";
  await settle(page);
  await tableFrame(page, scr, S);
  for (let i = 0; i < 7; i++) compare(scr, `cell a..g 6: ${"abcdefg"[i]}`, shapeOf(sh[5 + i]), await box(page, `[data-testid="four-col-${"abcdefg"[i]}"] .tb-cell`, 0));
  const last = sh.filter((x) => Math.abs(x.w - 38.6) < 0.5).at(-1);
  compare(scr, "cell g1", shapeOf(last), await box(page, '[data-testid="four-col-g"] .tb-cell', 5));
  await shot(page, "table-four");
}
await overflowAt(page, "table-four", 390);
await page.click('[data-testid="four-col-f"]');
for (let k = 0; k < 40 && stub.moves.length === 0; k++) await page.waitForTimeout(100);
note(stub.moves.length === 1 && stub.moves[0].move?.column === "f" && stub.moves[0].seq === 7, `walk: a tap on column f sends {seq: 7, move: {column: "f"}} (${JSON.stringify(stub.moves[0] ?? null)})`);
await page.locator('[data-testid="four-col-f"] .tb-cell[data-stand="mine"]').first().waitFor({ timeout: 10000 }).catch(() => {});
note(await page.locator('[data-testid="four-col-f"] .tb-cell[data-stand="mine"]').count() === 1, "walk: the piece stands in column f after the node's answer");
note(await page.locator('[data-testid="four-col-a"]').isDisabled(), "walk: with the turn passed to Nino the columns take no tap");
await page.click('[data-testid="table-back"]'); await page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
note(new URL(page.url()).pathname === "/tables", `walk: the table's back returns to the list at ${new URL(page.url()).pathname}`);
await ctx.close();

// w3_table-dots: the second table
{
  const sd = nodeStub();
  const o = await open(browser, PREVIEW + "/", 390, { screen: "w3g", prepare: sd.prepare });
  await registerFull(o.page); await toTable(o.page, 1);
  await o.page.locator('[data-testid="dot"]').nth(24).waitFor({ timeout: 20000 });
  if (want("dots")) {
    const S = sheetOf("dots"), sh = S.shapes, scr = "dots";
    await settle(o.page);
    await tableFrame(o.page, scr, S);
    compare(scr, "panel height", [sh[4].h], [(await box(o.page, ".tb-panel"))[3]]);
    const dots = sh.filter((x) => Math.abs(x.w - 9.9) < 0.3 && x.fill === "#f4eefc");
    for (const i of [0, 4, 12, 20, 24]) compare(scr, `dot ${i}`, shapeOf(dots[i]), await box(o.page, '[data-testid="dot"]', i));
    await shot(o.page, "table-dots");
  }
  note(await o.page.locator('[data-testid="box"][data-stand="mine"]').count() === 2 && await o.page.locator('[data-testid="box"][data-stand="theirs"]').count() === 2, "walk: two boxes stand mine, two Nino's");
  await overflowAt(o.page, "table-dots", 390);
  await o.page.click('[data-testid="edge-v:1:4"]');
  for (let k = 0; k < 40 && sd.moves.length === 0; k++) await o.page.waitForTimeout(100);
  note(sd.moves[0]?.move?.edge === "v:1:4" && sd.moves[0]?.table === "t2", `walk: a tap on the edge v:1:4 sends {move: {edge}} (${JSON.stringify(sd.moves[0] ?? null)})`);
  await o.page.locator('[data-testid="edge-v:1:4"][data-taken]').waitFor({ timeout: 10000 }).catch(() => {});
  note(await o.page.locator('[data-testid="edge-v:1:4"][data-taken]').count() === 1, "walk: the edge stands taken after the node's answer");
  await o.ctx.close();
}

// w3_table-hangman: the third table
{
  const sh3 = nodeStub();
  const o = await open(browser, PREVIEW + "/", 390, { screen: "w3g", prepare: sh3.prepare });
  await registerFull(o.page); await toTable(o.page, 2);
  await o.page.locator('[data-testid="key-p"]').waitFor({ timeout: 20000 });
  if (want("hangman")) {
    const S = sheetOf("hangman"), sh = S.shapes, L = S.lines, scr = "hangman";
    await settle(o.page);
    await tableFrame(o.page, scr, S);
    const keys = sh.filter((x) => Math.abs(x.w - 28.9) < 0.3 && Math.abs(x.h - 33.8) < 0.3);
    const row1 = keys.filter((x) => Math.abs(x.y - keys[0].y) < 1), row2 = keys.filter((x) => Math.abs(x.y - keys[0].y) >= 1);
    for (const [i, id] of [[0, "q"], [4, "t"], [9, "p"]]) compare(scr, `key ${id}`, shapeOf(row1[i]), await box(o.page, `[data-testid="key-${id}"]`));
    for (const [i, id] of [[0, "a"], [8, "l"]]) compare(scr, `key ${id}`, shapeOf(row2[i]), await box(o.page, `[data-testid="key-${id}"]`));
    left(scr, "first key letter (w)", L.find((l) => l.base > 430 && l.base < 450), await line(o.page, '[data-testid="key-w"]'));
    left(scr, "word's first letter", L.find((l) => l.base > 375 && l.base < 395), await line(o.page, '[data-testid="slot"]', 0));
    await shot(o.page, "table-hangman");
  }
  const spent = await o.page.locator('.tb-key[data-used]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")).sort().join(""));
  note(spent === "aefkqt", `walk: the tried letters are spent keys (${spent})`);
  await overflowAt(o.page, "table-hangman", 390);
  await o.page.click('[data-testid="key-r"]');
  for (let k = 0; k < 40 && sh3.moves.length === 0; k++) await o.page.waitForTimeout(100);
  note(sh3.moves[0]?.move?.letter === "r" && sh3.moves[0]?.table === "t3", `walk: a tap on R sends {move: {letter: "r"}} (${JSON.stringify(sh3.moves[0] ?? null)})`);
  await o.ctx.close();
}
// w3_table-reversi: the fourth table
{
  const sr = nodeStub();
  const o = await open(browser, PREVIEW + "/", 390, { screen: "w3g", prepare: sr.prepare });
  await registerFull(o.page); await toTable(o.page, 3);
  await o.page.locator('[data-testid="cell-h1"]').waitFor({ timeout: 20000 });
  const hints = await o.page.locator(".tb-hint").evaluateAll((els) => els.map((e) => e.closest("button").dataset.testid.slice(5)).sort().join(" "));
  if (want("reversi")) {
    const S = sheetOf("reversi"), sh = S.shapes, scr = "reversi";
    await settle(o.page);
    await tableFrame(o.page, scr, S);
    compare(scr, "panel height", [sh[4].h], [(await box(o.page, ".tb-panel"))[3]]);
    const pieces = sh.filter((x) => Math.abs(x.w - 33.8) < 0.3);
    const at = (x, y) => `${"abcdefgh"[Math.round((x - 15.9 - 5.35) / 44.525)]}${8 - Math.round((y - 160 - 5.35) / 44.525)}`;
    for (const p of pieces) compare(scr, `piece ${at(p.x, p.y)}`, shapeOf(p), await box(o.page, `[data-testid="cell-${at(p.x, p.y)}"] .tb-piece`));
    for (const d of sh.filter((x) => Math.abs(x.w - 10.8) < 0.3 && x.y > 150)) {
      const id = at(d.x - 11.5, d.y - 11.5);
      // A hint is the node's rule (a piece there turns one of theirs); the sheet's dots are drawn by hand, and a dot on a
      // cell that turns nothing is the sheet's slip, said and not compared.
      if (!hints.split(" ").includes(id)) { notes.push({ bad: false, text: `reversi: the sheet's dot on ${id} is no legal move of this position (legal: ${hints}) — not compared` }); continue; }
      compare(scr, `hint ${id}`, shapeOf(d), await box(o.page, `[data-testid="cell-${id}"] .tb-hint`));
    }
    await shot(o.page, "table-reversi");
  }
  await overflowAt(o.page, "table-reversi", 390);
  const first = hints.split(" ")[0];
  await o.page.click(`[data-testid="cell-${first}"]`);
  for (let k = 0; k < 40 && sr.moves.length === 0; k++) await o.page.waitForTimeout(100);
  note(sr.moves[0]?.move?.to === first && sr.moves[0]?.table === "t4", `walk: a tap on the hint ${first} sends {move: {to}} (${JSON.stringify(sr.moves[0] ?? null)})`);
  note(await o.page.locator('[data-testid="cell-a8"]').isDisabled(), "walk: a cell that turns nothing takes no tap");
  await o.ctx.close();
}
for (const w of [375, 320]) {
  const s2 = nodeStub();
  const o = await open(browser, PREVIEW + "/", w, { screen: "w3g", prepare: s2.prepare });
  await registerFull(o.page); await toTable(o.page); await settle(o.page);
  await overflowAt(o.page, "table-four", w);
  await o.page.click('[data-testid="table-back"]'); await o.page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  await o.page.locator('[data-testid="table-open"]').nth(1).click(); await o.page.locator('[data-testid="dot"]').nth(24).waitFor({ timeout: 20000 });
  await settle(o.page); await overflowAt(o.page, "table-dots", w);
  await o.page.click('[data-testid="table-back"]'); await o.page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  await o.page.locator('[data-testid="table-open"]').nth(2).click(); await o.page.locator('[data-testid="key-p"]').waitFor({ timeout: 20000 });
  await settle(o.page); await overflowAt(o.page, "table-hangman", w);
  await o.page.click('[data-testid="table-back"]'); await o.page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  await o.page.locator('[data-testid="table-open"]').nth(3).click(); await o.page.locator('[data-testid="cell-h1"]').waitFor({ timeout: 20000 });
  await settle(o.page); await overflowAt(o.page, "table-reversi", w); await o.ctx.close();
}

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
console.log(GEOMETRY ? `measure-app-w3-games: ${good} of ${rows.length} within ${TOL}px; notes ${clean ? "clean" : "DEFECTS"}` : `measure-app-w3-games[${TAG}]: fonts, overflow, walks, CSP ${clean ? "clean" : "DEFECTS"}`);
process.exit(good === rows.length && clean ? 0 : 1);
