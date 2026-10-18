// Measures the rendered app/ conversation against the Dusk sheets of wave 3 (mobile w3_chat, w3_chat-over), the panes
// drawn by the stand's build from views of their own (app/src/screens/chat-stand.tsx: /stand/chat, /stand/chat-over),
// so no node's keys or socket stand behind them; the conversation itself is e2e's (the chat paths). Expected values are
// read from the sheets (sheet-geometry.mjs), never typed in; the sheets' canvas is 388 wide in a 390 viewport.
//   run by scripts/measure-app-w3-chat.sh
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


async function open(browser, url, width, screen) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, locale: LOCALE, timezoneId: "UTC", isMobile: true, hasTouch: true, bypassCSP: !!OVERRIDE });
  await ctx.addInitScript(() => {
    try { localStorage.setItem("lang-asked", "1"); } catch {}
    document.addEventListener("securitypolicyviolation", (e) => console.error("CSP violation: " + e.violatedDirective + " " + e.blockedURI));
  });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) csp.push(`${screen}@${width} console: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => csp.push(`${screen}@${width} pageerror: ${String(e).slice(0, 200)}`));
  await page.goto(url, { waitUntil: "load" });
  if (OVERRIDE) await page.addStyleTag({ content: OVERRIDE });
  return { ctx, page };
}
const want = (n) => ONLY.length === 0 || ONLY.includes(n);
const shot = async (page, n) => { if (GEOMETRY) await page.screenshot({ path: `${SHOTS}/w3_${n}.png` }); };

const browser = await chromium.launch();
mkdirSync(SHOTS, { recursive: true });

if (want("chat")) {
  const scr = "chat", S = await sheet("chat"), sh = S.shapes, T = S.lines;
  const { ctx, page } = await open(browser, `${PREVIEW}/stand/chat`, 390, scr);
  await page.waitForSelector('[data-screen="chat"]'); await settle(page);
  compare(scr, "avatar", shapeOf(sh[1]), await box(page, ".ch-avatar"));
  left(scr, "avatar letter", T[0], await line(page, ".ch-avatar"));
  left(scr, "name", T[1], await line(page, ".ch-who h1"));
  left(scr, "fades line", T[2], await line(page, ".ch-line"));
  // the ring: the sheet draws its arc as the shape (a part of the circle), so its right edge, top and height
  { const r = await box(page, ".ch-ring"); compare(scr, "ring right,top,h", [sh[8].x + sh[8].w, sh[8].y, sh[8].h], [r[0] + r[2], r[1], r[3]]); }
  left(scr, "ring minutes", T[14], await line(page, ".ch-ring span"));
  compare(scr, "sheet left,top", [sh[2].x, sh[2].y], (await box(page, ".ch-sheet")).slice(0, 2));
  compare(scr, "starter chip", shapeOf(sh[3]), await box(page, ".ch-starter"));
  left(scr, "starter text", T[3], await line(page, ".ch-starter"));
  compare(scr, "theirs 1", shapeOf(sh[4]), await box(page, ".ch-theirs .ch-bubble", 0));
  left(scr, "theirs 1 line 1", T[4], await line(page, ".ch-theirs .ch-bubble", 0, 0));
  left(scr, "theirs 1 line 2", T[5], await line(page, ".ch-theirs .ch-bubble", 0, 1));
  left(scr, "theirs 1 time", T[6], await line(page, ".ch-theirs .ch-time", 0));
  compare(scr, "mine 1", shapeOf(sh[5]), await box(page, ".ch-mine .ch-bubble", 0));
  right(scr, "mine 1 text", T[7], await line(page, ".ch-mine .ch-bubble", 0));
  right(scr, "mine 1 time", T[8], await line(page, ".ch-mine .ch-time", 0));
  compare(scr, "theirs 2", shapeOf(sh[6]), await box(page, ".ch-theirs .ch-bubble", 1));
  left(scr, "theirs 2 line 1", T[9], await line(page, ".ch-theirs .ch-bubble", 1, 0));
  left(scr, "theirs 2 line 2", T[10], await line(page, ".ch-theirs .ch-bubble", 1, 1));
  left(scr, "theirs 2 time", T[11], await line(page, ".ch-theirs .ch-time", 1));
  compare(scr, "mine 2", shapeOf(sh[7]), await box(page, ".ch-mine .ch-bubble", 1));
  right(scr, "mine 2 text", T[12], await line(page, ".ch-mine .ch-bubble", 1));
  right(scr, "mine 2 time", T[13], await line(page, ".ch-mine .ch-time", 1));
  const chips = await boxOf(page, ".ch-chip");
  [9, 10, 11, 12].forEach((s, i) => compare(scr, `chip ${i + 1}`, shapeOf(sh[s]), chips[i] ?? NAN4));
  left(scr, "first chip word", T[15], await line(page, ".ch-chip", 0));
  compare(scr, "field", shapeOf(sh[13]), await box(page, ".ch-input"));
  compare(scr, "send", shapeOf(sh[14]), await box(page, ".ch-send"));
  await fonts(page, scr, [["name", ".ch-who h1"], ["bubble", ".ch-theirs .ch-bubble"], ["chip", ".ch-chip"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  await ctx.close();
}

if (want("chat-over")) {
  const scr = "chat-over", S = await sheet("chat-over"), sh = S.shapes, T = S.lines;
  const { ctx, page } = await open(browser, `${PREVIEW}/stand/chat-over`, 390, scr);
  await page.waitForSelector('[data-testid="tombstone"]'); await settle(page);
  left(scr, "ended line", T[2], await line(page, ".ch-line"));
  compare(scr, "theirs 1", shapeOf(sh[3]), await box(page, ".ch-theirs .ch-bubble", 0));
  compare(scr, "mine 1", shapeOf(sh[4]), await box(page, ".ch-mine .ch-bubble", 0));
  compare(scr, "lock mark", shapeOf(sh[5]), await box(page, ".ch-over-mark"));
  left(scr, "title", T[8], await line(page, ".ch-over h2"));
  left(scr, "text line 1", T[9], await line(page, ".ch-over p", 0, 0));
  left(scr, "text line 2", T[10], await line(page, ".ch-over p", 0, 1));
  compare(scr, "safety button", shapeOf(sh[6]), await box(page, ".ch-safety"));
  left(scr, "safety words", T[11], await line(page, ".ch-safety span"));
  note((await page.locator('[data-testid="text"], [data-testid="chat-more"]').count()) === 0, `${scr}: no field and no «…» on an ended chat`);
  await fonts(page, scr, [["title", ".ch-over h2"], ["text", ".ch-over p"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  await ctx.close();
}

if (want("chat-game")) {
  const scr = "chat-game", S = await sheet("chat-game"), sh = S.shapes, T = S.lines;
  const { ctx, page } = await open(browser, `${PREVIEW}/stand/chat-game`, 390, scr);
  await page.waitForSelector('[data-testid="chat-game"]'); await settle(page);
  left(scr, "proposal line", T[3], await line(page, ".chg-line"));
  compare(scr, "panel", shapeOf(sh[3]), await box(page, ".chg-panel"));
  left(scr, "title", T[4], await line(page, ".chg-head h2"));
  compare(scr, "turn pill", shapeOf(sh[4]), await box(page, ".chg-turn"));
  left(scr, "turn words", T[5], await line(page, ".chg-turn"));
  compare(scr, "board's place", shapeOf(sh[5]), await box(page, ".chg-board"));
  compare(scr, "resign", shapeOf(sh[49]), await box(page, ".chg-resign"));
  left(scr, "resign words", T[7], await line(page, ".chg-resign span"));
  compare(scr, "field", shapeOf(sh[50]), await box(page, ".ch-input"));
  compare(scr, "send", shapeOf(sh[51]), await box(page, ".ch-send"));
  note((await page.locator(".ch-quick").count()) === 0, `${scr}: no chips while the game is open`);
  await fonts(page, scr, [["title", ".chg-head h2"], ["resign", ".chg-resign span"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  await ctx.close();
}

if (want("chat-more")) {
  const scr = "chat-more", S = await sheet("chat-more"), sh = S.shapes, T = S.lines;
  const { ctx, page } = await open(browser, `${PREVIEW}/stand/chat-more`, 390, scr);
  await page.waitForSelector('[data-testid="chat-menu"]'); await settle(page);
  compare(scr, "sheet left,top", [sh[7].x, sh[7].y], (await box(page, ".chm-sheet")).slice(0, 2));
  left(scr, "title", T[12], await line(page, ".chm-sheet h2"));
  const rowsAt = await boxOf(page, ".chm-row"), icons = await boxOf(page, ".chm-icon");
  [8, 10, 12, 14, 16, 18].forEach((s, i) => compare(scr, `row ${i + 1}`, shapeOf(sh[s]), rowsAt[i] ?? NAN4));
  [9, 11, 13, 15, 17, 19].forEach((s, i) => compare(scr, `icon ${i + 1}`, shapeOf(sh[s]), icons[i] ?? NAN4));
  for (const [i, t] of [[0, 13], [1, 15], [2, 16], [3, 17], [4, 18], [5, 19]]) left(scr, `row ${i + 1} words`, T[t], await line(page, ".chm-text", i));
  right(scr, "fade after value", T[14], await line(page, ".chm-value"));
  await fonts(page, scr, [["title", ".chm-sheet h2"], ["row", ".chm-text"]]);
  await overflowAt(page, scr, 390); await shot(page, scr);
  await ctx.close();
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
console.log(GEOMETRY ? `measure-app-w3-chat: ${good} of ${rows.length} within ${TOL}px; notes ${clean ? "clean" : "DEFECTS"}` : `measure-app-w3-chat[${TAG}]: fonts, overflow, CSP ${clean ? "clean" : "DEFECTS"}`);
process.exit(good === rows.length && clean ? 0 : 1);
