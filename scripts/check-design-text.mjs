// Text on the mock-up sheets, measured in a browser: nothing may run past its
// phone frame, and no visible text may sit on top of other visible text.
// Run through scripts/check-design-text.sh, which mounts what this expects.
//
// Why a browser and not a regex: the width of a line depends on the face, the
// size and the letters, and the sheets are drawn with real fonts. On
// 2026-09-18 three lines ran past the 375 px frame and two toasts ran under
// their right-hand labels; the ratchet, which reads the SVG as text, saw none
// of it — only an eye on the render did. This is that eye, made cheap.
//
// A frame is a <g transform="translate(x,y)"> whose first <rect> is the phone
// (375 or 377 wide, 812 or 814 tall). For every <text> inside a frame:
//   * covered — elementFromPoint at its centre returns something else that is
//     not text (a bottom sheet, a card): hidden text is not a defect, skipped;
//   * overflow — its box leaves the frame by more than 1 px left or right;
//   * overlap — elementFromPoint at a third of its width returns another text.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";

const DESIGN = "/design";
const DESIGN_FONTS = "/design-fonts";   // the design's own faces, mounted apart so a probe copy without fonts still renders
const PANEL_FONTS = "/panel-fonts";
const PORT = 8323;
const TYPES = { ".svg": "image/svg+xml", ".woff2": "font/woff2" };

async function locate(path) {
  if (path.startsWith("/fonts/")) {
    const name = basename(path);
    for (const directory of [join(DESIGN, "fonts"), DESIGN_FONTS, PANEL_FONTS]) {
      try { return await readFile(join(directory, name)); } catch { continue; }
    }
    return null;
  }
  try { return await readFile(join(DESIGN, path)); } catch { return null; }
}

const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  const body = await locate(path);
  if (!body) { response.writeHead(404).end("not found"); return; }
  response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  response.end(body);
});
await new Promise((done) => server.listen(PORT, "127.0.0.1", done));

const only = process.env.ONLY || "";
const files = (await readdir(DESIGN))
  .filter((name) => /^screen-.*\.svg$/.test(name))
  .filter((name) => !only || basename(name, ".svg") === only);
if (files.length === 0) { console.error("листов нет — мерить нечего"); process.exit(3); }

const browser = await chromium.launch();
let problems = 0, texts = 0, frames = 0;

for (const file of files) {
  const source = await readFile(join(DESIGN, file), "utf-8");
  const width = Number(/width="(\d+)"/.exec(source)?.[1]);
  const height = Number(/height="(\d+)"/.exec(source)?.[1]);
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const found = await page.evaluate(() => {
    const out = { frames: 0, texts: 0, issues: [] };
    const isFrame = (g) => {
      const m = /^translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(g.getAttribute("transform") || "");
      if (!m) return null;
      const r = g.querySelector(":scope > rect");
      if (!r) return null;
      const w = Number(r.getAttribute("width")), h = Number(r.getAttribute("height"));
      if (!(w === 375 || w === 377) || !(h === 812 || h === 814)) return null;
      const box = g.getBoundingClientRect();
      const rb = r.getBoundingClientRect();
      return { x: rb.left, y: rb.top, w: rb.width, h: rb.height, id: `${m[1]},${m[2]}` };
    };
    for (const g of document.querySelectorAll("g[transform]")) {
      const f = isFrame(g);
      if (!f) continue;
      out.frames++;
      // Blocks and glyphs of this frame, measured once (review panel of 2026-09-19: text that runs
      // to its card's edge or onto an icon was found only by eye, five times in one day).
      const R = (e) => e.getBoundingClientRect();
      const painted = (e) => { const cs = getComputedStyle(e); const fill = cs.fill !== "none" && +cs.fillOpacity > 0.3; const stroke = cs.stroke !== "none" && parseFloat(cs.strokeWidth) > 0; return (fill || stroke) && +cs.opacity > 0.3; };
      const blocks = [...g.querySelectorAll("rect")].filter((r) => !r.hasAttribute("data-hit") && painted(r))
        .map((r) => ({ r, b: R(r) })).filter((x) => x.b.width >= 24 && x.b.height >= 16 && x.b.height < 600 && !(x.b.width >= 370 && x.b.height >= 600));
      const glyphs = [...g.querySelectorAll('g[data-kit^="icon-"]')].filter((k) => !/^icon-button/.test(k.dataset.kit))
        .map((k) => ({ k, b: R(k) })).filter((x) => x.b.width > 0);
      for (const t of g.querySelectorAll("text")) {
        const b = t.getBoundingClientRect();
        if (b.width === 0) continue;
        if (b.top >= f.y + f.h - 1) continue; // a caption under the phone, drawn inside the group
        const label = (t.textContent || "").trim().slice(0, 40);
        out.texts++;
        const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
        const isSelf = (e) => e === t || (e && e.closest && e.closest("text") === t);
        const sameFrame = (e) => e && e.closest && e.closest("text") && g.contains(e.closest("text"));
        const where = (e) => { const r = e.closest("text").getBoundingClientRect(); return `${(r.left - f.x).toFixed(0)},${(r.top - f.y).toFixed(0)} ${r.width.toFixed(0)}×${r.height.toFixed(0)}`; };
        // What lies above this text at a point: the stack from the top down to the
        // text itself. A surface (rect, path, circle) in that stack hides the text —
        // a bottom sheet, a card — and hidden text is not measured. Only text with
        // nothing but other text above it is visible text lying on text.
        const above = (x, y) => {
          const stack = document.elementsFromPoint(x, y);
          const i = stack.findIndex(isSelf);
          if (i < 0) return { hidden: true, text: null };
          const over = stack.slice(0, i);
          if (over.some((e) => /^(rect|path|circle|image|polygon|ellipse)$/.test(e.tagName))) return { hidden: true, text: null };
          const other = over.find(sameFrame);
          return { hidden: false, text: other ? other.closest("text") : null };
        };
        const centre = above(cx, cy);
        if (centre.hidden) continue;
        if (centre.text) {
          out.issues.push(`кадр ${f.id}: «${label}» (${(b.left - f.x).toFixed(0)},${(b.top - f.y).toFixed(0)} ${b.width.toFixed(0)}×${b.height.toFixed(0)}) под текстом «${(centre.text.textContent || "").trim().slice(0, 40)}» (${where(centre.text)})`);
          continue;
        }
        const left = b.left - f.x, right = b.right - f.x;
        if (left < -1) out.issues.push(`кадр ${f.id}: «${label}» выходит слева на ${(-left).toFixed(0)} px`);
        if (right > f.w + 1) out.issues.push(`кадр ${f.id}: «${label}» выходит справа на ${(right - f.w).toFixed(0)} px`);
        for (const k of [0.15, 0.85]) {
          const side = above(b.left + b.width * k, cy);
          if (!side.hidden && side.text) {
            out.issues.push(`кадр ${f.id}: «${label}» (${(b.left - f.x).toFixed(0)},${(b.top - f.y).toFixed(0)} ${b.width.toFixed(0)}×${b.height.toFixed(0)}) наезжает на «${(side.text.textContent || "").trim().slice(0, 40)}» (${where(side.text)})`);
            break;
          }
        }
        // inside its block: the smallest painted rect holding the line's centre keeps 4 px on both sides
        // the block seen right under the line: the first painted rect below it in the paint stack
        // (not the smallest by area — a pill of a card under the composer is smaller than the composer)
        const stackBelow = document.elementsFromPoint(cx, cy);
        const homeEl = stackBelow.slice(stackBelow.findIndex(isSelf) + 1).find((e) => e.tagName === "rect" && blocks.some((x) => x.r === e));
        const home = homeEl ? blocks.find((x) => x.r === homeEl) : null;
        if (home && home.b.width < f.w - 2) {
          const inL = b.left - home.b.left, inR = home.b.right - b.right;
          if (Math.min(inL, inR) < 3.5) out.issues.push(`кадр ${f.id}: «${label}» у края своего блока — слева ${inL.toFixed(0)}, справа ${inR.toFixed(0)} px, нужно 4 (блок ${(home.b.left - f.x).toFixed(0)},${(home.b.top - f.y).toFixed(0)} ${home.b.width.toFixed(0)}×${home.b.height.toFixed(0)})`);
        }
        // not on an icon of the kit
        // a glyph counts only while nothing of another component lies over its centre (a sheet or a dialog hides it)
        // A stroked icon is hollow: one probe at its centre falls through to whatever lies under it, and the
        // collision goes unseen (found 2026-09-20 by eye — an uppercase header ran under the filter icon).
        // So sample nine points of the glyph and call it visible unless something opaque of another component covers it.
        const visibleGlyph = (x) => {
          const own = x.k.parentElement && x.k.parentElement.closest('g[data-kit]:not([data-kit^="icon-"])');
          for (let i = 1; i <= 3; i++) for (let j = 1; j <= 3; j++) {
            const px = x.b.left + (x.b.width * i) / 4, py = x.b.top + (x.b.height * j) / 4;
            const st = document.elementsFromPoint(px, py);
            if (!st.length) continue;
            const blocker = st.find((e) => !x.k.contains(e) && e !== t && !t.contains(e) && e.tagName !== "text" && e.tagName !== "tspan"
              && !(own && own.contains(e) && e.tagName === "g"));
            const glyphAt = st.find((e) => x.k.contains(e));
            if (glyphAt && (!blocker || st.indexOf(glyphAt) < st.indexOf(blocker))) return true;
            if (!blocker) return true;   // nothing of another component lies here: the cell belongs to the glyph
          }
          return false;
        };
        const hit = glyphs.find((x) => !x.k.contains(t) && Math.min(b.right, x.b.right) - Math.max(b.left, x.b.left) > 1 && Math.min(b.bottom, x.b.bottom) - Math.max(b.top, x.b.top) > 1 && visibleGlyph(x));
        if (hit) out.issues.push(`кадр ${f.id}: «${label}» лежит на иконке ${hit.k.dataset.kit} (${(hit.b.left - f.x).toFixed(0)},${(hit.b.top - f.y).toFixed(0)})`);
      }
    }
    return out;
  });
  await context.close();
  frames += found.frames; texts += found.texts; problems += found.issues.length;
  const unique = [...new Set(found.issues)];
  console.log(`  ${unique.length ? "✗" : "✓"} ${file.padEnd(26)} кадров ${found.frames}, подписей ${found.texts}${unique.length ? `, дефектов ${unique.length}` : ""}`);
  for (const line of unique) console.log(`      ${line}`);
}

await browser.close();
server.close();
console.log(problems
  ? `✗ листов: ${files.length}, кадров: ${frames}, подписей: ${texts} — дефектов текста: ${problems}`
  : `листов: ${files.length}, кадров: ${frames}, подписей: ${texts} — ни одна не выходит за кадр и не лежит на другой`);
process.exit(problems ? 1 : 0);
