// Snapshots a screen of the running app/ shell (stand http://localhost:5174) as SVG built from the DOM, not a raster: a model reads it as text.
// Run by scripts/snap-svg.sh in the Playwright image on the stand's network. The node stub, the page opener and the registration steps are IMPORTED
// from measure-app-overlap.mjs (not copied); the click path to each scene follows that file's walkWidth.
//
//   SCENES=me,me-blocked WIDTHS=1920 OUT=/out node snap-svg.mjs        (SCENES=all: every scene below)  ->  /out/<scene>@<w>.svg
//
// SVG: one <rect x y width height rx fill stroke data-sel="tag[testid].class"> per visible box that paints (a background, a border, a control, an image) or clips;
// <text x y font-size font-weight fill> per line of real words; an ancestor with overflow not visible becomes a <clipPath> and a child running past it gets
// data-clipped="L|R|T|B" (any of the letters; sideways past any overflow edge, hidden or auto, since a panel that scrolls sideways is itself the defect;
// up/down only past hidden/clip, and not past an outer one beyond a vertical scroller: that child is reached by scrolling); an inline svg is <g data-icon data-sel><rect bbox/></g>.
// Root: data-scroll-x="true" if the page or a panel (overflow-x auto/scroll) is wider than it shows (data-scroll-x-at names up to 3), data-nav="present|missing"
// (a visible <nav> holding 4 tab buttons [data-testid^=tab-]). Skipped: display none, visibility hidden, opacity ~0, zero-size boxes. Numbers: 1 decimal.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { DEV, nodeStub, openPage, settle, register, confirmPaper, feedSel } from "./measure-app-overlap.mjs";

const OUT = process.env.OUT ?? "/out";
const WIDTHS = (process.env.WIDTHS ?? "390").split(",").map(Number);
const T = { timeout: 8000 };
const SUBS = ["name", "theme", "lang", "filter", "pin", "reissue", "away", "place", "legal", "statements", "hidden", "blocked", "reset"];

// ── in the page ──
const IN_PAGE = `() => {
  const r1 = (n) => Math.round(n * 10) / 10;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const hex = (c) => { const m = c.match(/rgba?\\((\\d+), (\\d+), (\\d+)(?:, ([\\d.]+))?\\)/); if (!m) return null; const a = m[4] === undefined ? 1 : Number(m[4]); if (a === 0) return null; return { h: "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join(""), a }; };
  const sel = (e) => { const cls = typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\\s+/)[0] : ""; return e.tagName.toLowerCase() + (e.dataset && e.dataset.testid ? "[" + e.dataset.testid + "]" : "") + cls; };
  const vis = (e) => { for (let p = e; p; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.01 || p.hasAttribute("hidden")) return false; } return true; };
  const clips = new Map(); let cid = 0; const defs = [];
  // a static box still holds absolute descendants (is their containing block) when one of these is set (CSS Transforms, Filter Effects, Containment)
  const holdsAbs = (cs) => cs.transform !== "none" || cs.translate !== "none" || cs.rotate !== "none" || cs.scale !== "none" || cs.perspective !== "none"
    || cs.filter !== "none" || (cs.backdropFilter ?? "none") !== "none" || /paint|layout|strict|content/.test(cs.contain) || /transform|filter|perspective|translate|rotate|scale/.test(cs.willChange)
    || (cs.containerType ?? "normal") !== "normal";
  const clipAncestors = (e) => {   // [{el, box}] nearest first; a fixed element escapes the clips above it
    const out = [];
    let abs = false;   // the box below is absolute: a static ancestor is not its containing block and does not clip it (CSS 2.1 §11.1.1)
    for (let p = e; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const skip = p !== e && abs && cs.position === "static" && !holdsAbs(cs);
      if (!skip) abs = cs.position === "absolute";
      if (p !== e && !skip && (cs.overflowX !== "visible" || cs.overflowY !== "visible")) out.push({ p, ox: true, oy: cs.overflowY === "hidden" || cs.overflowY === "clip", sx: false, sy: cs.overflowY === "auto" || cs.overflowY === "scroll" });   // auto/scroll: a clipPath, but what lies past it is reached by scrolling, not flagged
      if (cs.position === "fixed") break;
    }
    return out;
  };
  const clipId = (p) => { if (!clips.has(p)) { const b = p.getBoundingClientRect(); const id = "c" + (++cid); clips.set(p, id); defs.push('<clipPath id="' + id + '" data-sel="' + esc(sel(p)) + '"><rect x="' + r1(b.left + scrollX) + '" y="' + r1(b.top + scrollY) + '" width="' + r1(b.width) + '" height="' + r1(b.height) + '"/></clipPath>'); } return clips.get(p); };
  const flags = (e, box) => {   // box {l,t,r,b} in client coords: which sides run past a clipping ancestor
    let f = "", id = null; const cl = clipAncestors(e);
    let doneX = false, doneY = false;   // past the first scrolling ancestor on an axis, outer clips no longer matter there: the box is reached by scrolling
    for (const { p, ox, oy, sx: scx, sy: scy } of cl) {
      const b = p.getBoundingClientRect(); id = id ?? clipId(p);
      if (ox && !doneX) { if (box.l < b.left - 1) f += "L"; if (box.r > b.right + 1) f += "R"; }
      if (oy && !doneY) { if (box.t < b.top - 1) f += "T"; if (box.b > b.bottom + 1) f += "B"; }
      if (scx) doneX = true; if (scy) doneY = true;
    }
    return { f: [...new Set(f)].join(""), id };
  };
  const body = [], seen = new Set();
  const sx = scrollX, sy = scrollY;
  const root = document.body;
  const scrollAt = [];
  for (const e of [document.documentElement, ...root.querySelectorAll("*")]) {
    const tag = e.tagName.toLowerCase();
    if (["script", "style", "link", "meta", "head", "title", "br", "option", "path", "g", "defs", "use", "circle", "rect", "line", "polyline", "polygon", "ellipse", "tspan", "clippath", "mask", "lineargradient", "radialgradient", "stop", "text"].includes(tag) && !(tag === "rect" && false)) continue;
    if (e.closest("svg") && tag !== "svg") continue;
    if (e !== document.documentElement && !vis(e)) continue;
    const cs = getComputedStyle(e);
    if (e.scrollWidth > e.clientWidth + 1 && (e === document.documentElement || cs.overflowX === "auto" || cs.overflowX === "scroll")) scrollAt.push(sel(e) + " " + e.scrollWidth + ">" + e.clientWidth);
    if (e === document.documentElement) continue;
    const b = e.getBoundingClientRect();
    if (b.width >= 0.5 && b.height >= 0.5) {
      if (tag === "svg") {
        const fl = flags(e, { l: b.left, t: b.top, r: b.right, b: b.bottom });
        body.push('<g data-icon data-sel="' + esc(sel(e)) + '"' + (fl.f ? ' data-clipped="' + fl.f + '"' : "") + (fl.id ? ' clip-path="url(#' + fl.id + ')"' : "") + '><rect x="' + r1(b.left + sx) + '" y="' + r1(b.top + sy) + '" width="' + r1(b.width) + '" height="' + r1(b.height) + '" fill="none"/></g>');
      } else {
        const bg = hex(cs.backgroundColor), bw = parseFloat(cs.borderTopWidth) || 0, bc = bw > 0 && cs.borderTopStyle !== "none" ? hex(cs.borderTopColor) : null;
        const control = ["button", "input", "textarea", "select", "img", "canvas", "video"].includes(tag);
        const clipper = cs.overflowX !== "visible" || cs.overflowY !== "visible";
        if (bg || bc || control || clipper || cs.backgroundImage !== "none") {
          const fl = flags(e, { l: b.left, t: b.top, r: b.right, b: b.bottom });
          let rx = parseFloat(cs.borderTopLeftRadius) || 0; if (cs.borderTopLeftRadius.includes("%")) rx = Math.min(b.width, b.height) * rx / 100; rx = Math.min(rx, Math.min(b.width, b.height) / 2);
          body.push('<rect x="' + r1(b.left + sx) + '" y="' + r1(b.top + sy) + '" width="' + r1(b.width) + '" height="' + r1(b.height) + '"' + (rx ? ' rx="' + r1(rx) + '"' : "") +
            ' fill="' + (bg ? bg.h : "none") + '"' + (bg && bg.a < 1 ? ' fill-opacity="' + r1(bg.a) + '"' : "") + (bc ? ' stroke="' + bc.h + '"' : "") + (clipper ? ' data-overflow="' + cs.overflowX + "/" + cs.overflowY + '"' : "") +
            (fl.f ? ' data-clipped="' + fl.f + '"' : "") + (fl.id ? ' clip-path="url(#' + fl.id + ')"' : "") + ' data-sel="' + esc(sel(e)) + '"/>');
        }
      }
    }
    if (tag === "svg") continue;
    // own text nodes, line by line (words grouped by their top)
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const txt = n.textContent, words = [...txt.matchAll(/\\S+/g)], lines = [];
      for (const w of words) {
        const g = document.createRange(); g.setStart(n, w.index); g.setEnd(n, w.index + w[0].length);
        const q = [...g.getClientRects()].filter((x) => x.width && x.height)[0]; if (!q) continue;
        const last = lines[lines.length - 1];
        if (last && Math.abs(last.t - q.top) < q.height / 2) { last.s += " " + w[0]; last.r = Math.max(last.r, q.right); last.b = Math.max(last.b, q.bottom); }
        else lines.push({ s: w[0], l: q.left, t: q.top, r: q.right, b: q.bottom });
      }
      const col = hex(cs.color) ?? { h: "#000000", a: 1 };
      for (const L of lines) {
        const fl = flags(e, { l: L.l, t: L.t, r: L.r, b: L.b });
        body.push('<text x="' + r1(L.l + sx) + '" y="' + r1(L.b + sy) + '" font-size="' + r1(parseFloat(cs.fontSize)) + '" font-weight="' + cs.fontWeight + '" fill="' + col.h + '"' + (col.a < 1 ? ' fill-opacity="' + r1(col.a) + '"' : "") +
          (fl.f ? ' data-clipped="' + fl.f + '"' : "") + (fl.id ? ' clip-path="url(#' + fl.id + ')"' : "") + ' data-sel="' + esc(sel(e)) + '"' +
          (cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1 ? ' data-ellipsis="true"' : "") + '>' + esc(L.s) + '</text>');
      }
    }
  }
  const navs = [...document.querySelectorAll("nav")].filter((n) => vis(n) && n.getBoundingClientRect().width > 0 && [...n.querySelectorAll('button[data-testid^="tab-"]')].filter(vis).length >= 4);
  const W = Math.max(innerWidth, document.documentElement.scrollWidth), H = Math.max(innerHeight, document.documentElement.scrollHeight);
  const bgc = hex(getComputedStyle(document.body).backgroundColor) ?? hex(getComputedStyle(document.documentElement).backgroundColor);
  const sxFlag = scrollAt.length > 0;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" data-viewport="' + innerWidth + "x" + innerHeight + '" data-scroll-x="' + sxFlag + '"' +
    (sxFlag ? ' data-scroll-x-at="' + esc(scrollAt.slice(0, 3).join("; ")) + '"' : "") + ' data-nav="' + (navs.length ? "present" : "missing") + '">\\n' +
    (defs.length ? "<defs>" + defs.join("") + "</defs>\\n" : "") + '<rect width="' + W + '" height="' + H + '" fill="' + (bgc ? bgc.h : "#ffffff") + '" data-sel="page"/>\\n' + body.join("\\n") + "\\n</svg>\\n";
}`;

// ── the scenes: the click path follows walkWidth of measure-app-overlap.mjs ──
const click = async (page, sel) => { try { await page.click(sel, { timeout: 2500 }); } catch (e) { if (!(await page.locator(sel).first().count())) throw e; await page.locator(sel).first().evaluate((el) => el.click()); } };
const wait = (page, sel) => page.waitForSelector(sel, T);
const tab = (page, t) => click(page, `[data-testid="tab-${t}"]`);
const back = async (page, sel) => { await page.click(sel, T).catch(() => page.goBack().catch(() => {})); await page.waitForTimeout(350); };
const home = async (page, t, ready) => {
  for (let k = 0; k < 5; k++) {
    if (await page.locator(ready).first().isVisible().catch(() => false)) return;
    const b = page.locator('.me-back:visible, [data-testid$="-back"]:visible, [data-testid="back"]:visible').first();
    if (await b.isVisible().catch(() => false)) await b.click({ timeout: 2000 }).catch(() => {});
    else await page.click(`[data-testid="tab-${t}"]`, { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(350);
  }
};

const wanted = (process.env.SCENES ?? "me").split(",");
const all = wanted.includes("all");
// "blocked" is a short name of "me-blocked"
const want = (n) => all || wanted.includes(n) || wanted.includes(n.replace(/^me-/, ""));
const done = [], failed = [];

async function snap(page, name, w) {
  await page.waitForTimeout(350);
  await settle(page);
  const svg = await page.evaluate(`(${IN_PAGE})()`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}@${w}.svg`, svg);
  const clipped = (svg.match(/data-clipped=/g) ?? []).length;
  done.push(name);
  console.log(`SNAP ${name}@${w}: ${svg.length} bytes, clipped ${clipped}, ${svg.match(/data-nav="(\w+)"/)[1] === "present" ? "nav present" : "nav missing"}`);
  return svg;
}
// a scene: open() brings the screen up and throws if it can't; close() goes back. Only wanted scenes are snapped; every open still runs when a later scene needs the path.
async function scene(page, name, w, open, close) {
  if (!want(name)) { if (close) { /* not entered */ } return; }
  try { await open(); await snap(page, name, w); } catch (e) { failed.push(`${name}@${w}: ${String(e.message).split("\n")[0].slice(0, 160)}`); }
  if (close) await close().catch(() => {});
}

async function walk(browser, w) {
  const stub = nodeStub();
  const o = await openPage(browser, w, { prepare: stub.prepare, reducedMotion: "reduce" });
  const { page } = o;
  await page.goto(DEV + "/", { waitUntil: "load" });
  await scene(page, "splash", w, () => wait(page, '[data-testid="start"]'));
  await scene(page, "restore", w, async () => { await click(page, '[data-testid="restore"]'); await wait(page, '[data-screen="restore"]'); await page.fill('[data-testid="restore-code"]', "K7QM2XWDPL4R"); await page.fill('[data-testid="restore-pin"]', "1234"); },
    async () => { await back(page, '[data-testid="restore-back"]'); await wait(page, '[data-testid="start"]'); });
  await click(page, '[data-testid="start"]'); await wait(page, '[data-screen="register-1"]');
  await scene(page, "register-1", w, async () => {});
  await page.fill('[data-testid="name"]', "Alex"); await page.fill('[data-testid="age"]', "32"); await page.check(".reg-check input");
  await click(page, '[data-testid="next"]'); await wait(page, '[data-screen="register-2"]');
  await scene(page, "register-2", w, async () => {});
  await page.fill('[data-testid="pin"]', "483915"); await page.fill('[data-testid="pin-again"]', "483915");
  await click(page, '[data-testid="register"]'); await page.waitForSelector('[data-screen="register-3"]', { timeout: 90000 });
  await scene(page, "register-3", w, async () => {});
  await confirmPaper(page);
  await scene(page, "feed", w, () => wait(page, '[data-testid="cards"] [data-testid="card"]'));
  await scene(page, "card", w, async () => { await click(page, '[data-testid="cards"] [data-testid="card"] .fd-open'); await wait(page, '[data-screen="card"]'); }, async () => { await back(page, '[data-testid="back"]'); await wait(page, feedSel); });
  await scene(page, "feed-table", w, async () => { await wait(page, '[data-testid="cards"] [data-testid="table-card"]'); });
  await scene(page, "composer", w, async () => {
    const rail = page.locator('[data-testid="rail-say"]'), fab = page.locator('[data-testid="write"]');
    if (await rail.isVisible().catch(() => false)) await rail.click(T); else await fab.click(T);
    await wait(page, '[data-screen="composer"]'); await page.fill('[data-testid="text"]', "Backgammon in the yard tonight?");
  }, async () => { await back(page, '[data-testid="composer-back"]'); await wait(page, feedSel).catch(() => {}); });
  await scene(page, "talks", w, async () => { await tab(page, "chats"); await wait(page, '[data-testid="open-chat"]'); });
  await scene(page, "chat", w, async () => { await page.locator('[data-testid="open-chat"]').first().click(T); await wait(page, '[data-screen="chat"], [data-testid="chat-pane"]'); }, async () => { await page.goBack(); await page.waitForTimeout(400); await tab(page, "chats"); });
  await scene(page, "match", w, async () => { await page.locator('[data-testid="open-match"]').first().click(T); await wait(page, '[data-screen="match"]'); }, async () => { await page.goBack(); await page.waitForTimeout(400); });
  await scene(page, "likes", w, async () => { await tab(page, "chats"); await click(page, '[data-testid="open-likes"]'); await wait(page, '[data-screen="likes"]'); }, async () => { await page.goBack(); await page.waitForTimeout(400); });
  await scene(page, "tables", w, async () => { await tab(page, "tables"); await wait(page, '[data-screen="tables"]'); await wait(page, '[data-testid="tables"]'); });
  await scene(page, "table", w, async () => { await page.locator('[data-testid="table-open"]').first().click(T); await wait(page, '[data-screen="table"]'); }, async () => { await back(page, '[data-testid="table-back"]'); await wait(page, '[data-screen="tables"]').catch(() => {}); });
  await scene(page, "new-table", w, async () => { await click(page, '[data-testid="new-table"]'); await wait(page, '[data-screen="new-table"]'); }, async () => { await back(page, '[data-testid="new-table-back"]'); });
  await home(page, "me", '[data-testid="tab-me"]');
  await scene(page, "me", w, async () => { await tab(page, "me"); await wait(page, '[data-screen="me"] .me-hero'); });
  for (const sub of SUBS) {
    const row = sub === "name" ? "me-name" : `me-${sub}`;
    if (!want("me-" + sub)) continue;
    await home(page, "me", `[data-screen="me"] [data-testid="${row}"]`);
    await scene(page, "me-" + sub, w, async () => { await click(page, `[data-testid="${row}"]`); await page.waitForTimeout(350); if (sub !== "name" && await page.locator(`[data-screen="me"] [data-testid="${row}"]`).count()) throw new Error("the row still shows: no subpage opened"); });
  }
  if (want("departure")) { await home(page, "me", '[data-screen="me"] [data-testid="me-move"]'); await scene(page, "departure", w, async () => { await click(page, '[data-testid="me-move"]'); await wait(page, '[data-screen="departure"]'); }); }
  await o.ctx.close();
  if (!(all || wanted.some((n) => n.startsWith("cabinet")))) return;
  const cs = nodeStub({ signedIn: false });
  const c = await openPage(browser, w, { prepare: cs.prepare });
  const cp = c.page;
  await scene(cp, "cabinet-sign-in", w, async () => { await cp.goto(DEV + "/adv", { waitUntil: "load" }); await wait(cp, '[data-testid="adv-email"]'); });
  await scene(cp, "cabinet-venues", w, async () => { cs.s.signedIn = true; await cp.goto(DEV + "/adv", { waitUntil: "load" }); await wait(cp, '[data-testid="venue"]'); });
  await scene(cp, "cabinet-offers", w, async () => { await click(cp, '[data-testid="offers-open"]'); await wait(cp, '[data-testid="adv-offer"]'); });
  await c.ctx.close();
}

const browser = await chromium.launch();
for (const w of WIDTHS) {
  try { await walk(browser, w); } catch (e) { failed.push(`walk @${w}: ${String(e.message).split("\n")[0].slice(0, 200)}`); }
}
await browser.close();
for (const f of failed) console.log("UNREACHABLE " + f);
process.exit(done.length ? 0 : 1);
