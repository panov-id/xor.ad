// Measures the rendered app/ table (the frame, then each game's board) against the Dusk sheets of wave 3 (mobile
// w3_table-four; more games as their boards come), and walks it against a stubbed node: the list's «Watch» opens the
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
function tableView(s) {
  return {
    id: "t1", class: "grid", set: "four", seat: 1, is_playing: true, playing: 2, watching: 0, name: "Evening at the yard", like_count: 0, lines: [],
    seats: [{ seat: 1, name: "Alex", role: "playing" }, { seat: 2, name: "Nino", role: "playing" }],
    board: { seq: s.seq, state: { grid: { cells: cellsOf(s.cells), claim: null, rules: "four" } }, turn: s.turn, score: {}, expires_at: s.due, pending: null },
  };
}
function nodeStub() {
  const calls = [], moves = [];
  const s = { share: null, pinAuth: null, seq: 7, turn: 1, cells: { ...FOUR }, due: Math.floor(Date.now() / 1000) + 100 };
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
      if (key === "GET /tables") return json(200, { items: [{ id: "t1", game: "grid", set: "four", playing: 2, free_seats: 0, watching: 0, like_count: 0, name: "Evening at the yard" }], next: null, mine: [] });
      if (key === "GET /tables/t1") return json(200, tableView(s));
      if (key === "POST /tables/t1/moves") {
        const m = body(); moves.push(m);
        const col = m.move?.column; let r = 1; while (s.cells[`${col}${r}`]) r++;
        s.cells[`${col}${r}`] = 1; s.seq++; s.turn = 2;
        return json(200, { board: tableView(s).board });
      }
      if (key === "POST /tables/t1/ticket") return json(503, { error: { code: "unavailable" } });   // no room in the stub: the screen reads the view
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
async function toTable(page) {
  await page.click('[data-testid="tab-tables"]'); await page.waitForSelector('[data-screen="tables"]', { timeout: 20000 });
  await page.locator('[data-testid="table-open"]').first().click(); await page.waitForSelector('[data-screen="table"]', { timeout: 20000 });
  await page.locator(".tb-panel").first().waitFor({ timeout: 20000 });
}
// the frame every game's sheet shares
async function tableFrame(page, scr, S) {
  const sh = S.shapes, L = S.lines;
  compare(scr, "face left", shapeOf(sh[1]), await box(page, '[data-testid="face-left"]'));
  compare(scr, "face right", shapeOf(sh[2]), await box(page, '[data-testid="face-right"]'));
  compare(scr, "sheet left,top", [sh[3].x, sh[3].y], (await box(page, ".tb-sheet")).slice(0, 2));
  compare(scr, "panel left,top,width", [sh[4].x, sh[4].y, sh[4].w], (await box(page, ".tb-panel")).slice(0, 3));
  const titleLines = L[1].base < 70 ? 2 : 1;
  left(scr, "title line 1", L[0], await line(page, ".tb-bar h1", 0, 0));
  if (titleLines === 2) left(scr, "title line 2", L[1], await line(page, ".tb-bar h1", 0, 1));
  const at = titleLines === 2 ? 2 : 1;
  left(scr, "face left letter", L[at], await line(page, '[data-testid="face-left"]'));
  left(scr, "my line", L[at + 1], await line(page, ".tb-me"));
  left(scr, "face right letter", L[at + 2], await line(page, '[data-testid="face-right"]'));
  left(scr, "ring minutes", L[at + 3], await line(page, '[data-testid="move-ring"]'));
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
for (const w of [375, 320]) {
  const s2 = nodeStub();
  const o = await open(browser, PREVIEW + "/", w, { screen: "w3g", prepare: s2.prepare });
  await registerFull(o.page); await toTable(o.page); await settle(o.page);
  await overflowAt(o.page, "table-four", w); await o.ctx.close();
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
