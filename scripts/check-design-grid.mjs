// The terminal sheets against the character grid, measured in a browser.
// A terminal has no sub-pixel placement: every glyph sits in a cell. So for each <text> inside g.term:
//   * its x sits on a column: (x − PAD) % CW == 0, and its baseline on a row;
//   * what it draws is no wider than the cells it claims — otherwise the next segment on that row is overdrawn,
//     which is how a non-monospace glyph (an arrow, a box-drawing rule) slips in unnoticed.
// The cell is read from the sheet itself (data-cw/data-ch on the frame), not assumed. Run through check-design-grid.sh.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";

const DESIGN = "/design", PORT = 8326;
async function locate(path) {
  if (path.startsWith("/fonts/")) {
    for (const d of [join(DESIGN, "fonts"), "/design-fonts", "/panel-fonts"]) { try { return await readFile(join(d, basename(path))); } catch { continue; } }
    return null;
  }
  try { return await readFile(join(DESIGN, path)); } catch { return null; }
}
const server = createServer(async (q, r) => {
  const path = normalize(decodeURIComponent(new URL(q.url, "http://x").pathname));
  const body = await locate(path);
  if (!body) { r.writeHead(404).end(); return; }
  r.writeHead(200, { "content-type": extname(path) === ".svg" ? "image/svg+xml" : "font/woff2" }); r.end(body);
});
await new Promise((d) => server.listen(PORT, "127.0.0.1", d));
const only = process.env.ONLY || "";
const files = (await readdir(DESIGN)).filter((n) => /^screen-.*\.svg$/.test(n)).filter((n) => !only || basename(n, ".svg") === only);
if (!files.length) { console.error("листов нет — мерить нечего"); process.exit(3); }
const browser = await chromium.launch();
let problems = 0, glyphs = 0, frames = 0;
for (const file of files) {
  const src = await readFile(join(DESIGN, file), "utf-8");
  if (!/class="[^"]*\bterm\b/.test(src)) continue;                 // only the terminal sheets carry a grid
  const width = Number(/width="(\d+)"/.exec(src)[1]), height = Number(/height="(\d+)"/.exec(src)[1]);
  const page = await browser.newPage({ viewport: { width: Math.min(width, 2000), height: Math.min(height, 2000) } });
  await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
  const found = await page.evaluate(() => {
    const out = { n: 0, frames: 0, issues: [] };
    for (const term of document.querySelectorAll("g.term")) {
      out.frames++;
      const cw = +(term.dataset.cw || 9), ch = +(term.dataset.ch || 20), pad = +(term.dataset.pad || 16);
      const box = term.getBoundingClientRect();
      // East-Asian-Width A and W: a terminal with ambiguous=wide (the default under CJK locales, a switch in
      // iTerm2, PuTTY, mintty) gives these two cells, and every column to their right slides. The mock-up may not
      // use them at all — what it draws has to be what a plain xterm draws.
      const WIDE = /[\u2010-\u2027\u2030-\u205E\u2100-\u2BFF\u25A0-\u27BF\u3000-\u303E\u4E00-\u9FFF\uFF00-\uFF60\u00A7\u00A8\u00B1\u00B4\u00D7\u00F7]/u;
      for (const t of term.querySelectorAll("text")) {
        const bad = [...t.textContent].filter((c) => WIDE.test(c));
        if (bad.length) {
          const at0 = `кадр ${Math.round(term.getBoundingClientRect().left)},${Math.round(term.getBoundingClientRect().top)} · «${t.textContent.trim().slice(0, 22)}»`;
          out.issues.push(`${at0}: знак неоднозначной ширины ${[...new Set(bad)].map((c) => "U+" + c.codePointAt(0).toString(16).toUpperCase()).join(" ")} — в терминале с ambiguous=wide займёт две клетки`);
        }
      }
      for (const t of term.querySelectorAll("text")) {
        const b = t.getBoundingClientRect(), chars = t.textContent.length;
        if (!chars || !b.width) continue;
        out.n++;
        const col = (b.left - box.left - pad) / cw, row = (+t.getAttribute("y") - pad - 15) / ch;
        const at = `кадр ${Math.round(box.left)},${Math.round(box.top)} · «${t.textContent.trim().slice(0, 22)}»`;
        if (Math.abs(col - Math.round(col)) > 0.02) out.issues.push(`${at}: начало не на колонке (${col.toFixed(2)})`);
        if (Math.abs(row - Math.round(row)) > 0.02) out.issues.push(`${at}: строка не на сетке (${row.toFixed(2)})`);
        const claim = chars * cw, tl = t.getAttribute("textLength");
        if (tl !== null) {
          // a declared squeeze: the run is pinned to its cells, and the number must be exactly that
          if (Math.abs(+tl - claim) > 0.01) out.issues.push(`${at}: textLength ${tl} при ${chars} клетках (${claim} px)`);
          if (t.getAttribute("lengthAdjust") !== "spacingAndGlyphs") out.issues.push(`${at}: textLength без lengthAdjust="spacingAndGlyphs"`);
        } else if (b.width > claim + 0.5) {
          out.issues.push(`${at}: рисует ${b.width.toFixed(1)} px на ${chars} клеток (${claim} px) — знак шире клетки`);
        }
      }
    }
    return out;
  });
  await page.close();
  const unique = [...new Set(found.issues)]; problems += unique.length; glyphs += found.n; frames += found.frames;
  console.log(`  ${unique.length ? "✗" : "✓"} ${file.padEnd(26)} кадров ${found.frames}, строк ${found.n}${unique.length ? `, дефектов ${unique.length}` : ""}`);
  for (const l of unique.slice(0, 12)) console.log(`      ${l}`);
  if (unique.length > 12) console.log(`      … и ещё ${unique.length - 12}`);
}
await browser.close(); server.close();
if (!frames) { console.error("терминальных кадров нет — мерить нечего"); process.exit(3); }
console.log(problems ? `✗ кадров: ${frames}, строк: ${glyphs} — вне сетки: ${problems}` : `кадров: ${frames}, строк: ${glyphs} — каждый знак стоит в своей клетке`);
process.exit(problems ? 1 : 0);
