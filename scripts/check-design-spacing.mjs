// Spacing on the mock-up sheets, measured in a browser. Two rules, owner's request of 2026-09-19
// («не отцентрованы надписи под кнопками, расстояние под кнопками до границы блока слишком маленькое»):
//   * inset — a kit button (g[data-kit^="button-"], 40–60 tall) inside a filled container keeps at least
//     16 px to the container's bottom and 12 px to its sides; the phone and full-screen grounds do not count;
//   * caption — a line right under a button that stands alone in its row (0–30 px below, same frame,
//     overlapping it horizontally) is centred on the button or starts at its left edge, ±3 px.
// The button is its own rect, not the +3,+3 shadow under the primary (a first version measured the shadow).
// Only kit buttons are seen: a button drawn inline carries no data-kit. Run through check-design-spacing.sh.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";

const DESIGN = "/design", PORT = 8324;
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
let problems = 0, buttons = 0;
for (const file of files) {
  const src = await readFile(join(DESIGN, file), "utf-8");
  const width = Number(/width="(\d+)"/.exec(src)[1]), height = Number(/height="(\d+)"/.exec(src)[1]);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(200);
  const found = await page.evaluate(() => {
    const out = { n: 0, issues: [] }; const R = (e) => e.getBoundingClientRect();
    const frameOf = (e) => { for (let g = e.parentElement; g && g.tagName !== "svg"; g = g.parentElement) { const r = g.querySelector(":scope > rect"); if (/^translate/.test(g.getAttribute("transform") || "") && r && [375, 377].includes(+r.getAttribute("width")) && [812, 814].includes(+r.getAttribute("height"))) return g; } return null; };
    const filled = (e) => { const s = getComputedStyle(e); return s.fill !== "none" && +s.fillOpacity > 0.5 && +s.opacity > 0.3; };
    const btns = [...document.querySelectorAll('g[data-kit^="button-"]')].filter((g) => !/send|text/.test(g.dataset.kit))
      .map((g) => ({ g, k: g.dataset.kit, f: frameOf(g), b: R(g.querySelector('rect:not([data-hit]):not([style*="--shadow"])')) }))
      .filter((x) => x.f && x.b.height >= 40 && x.b.height <= 60);
    out.n = btns.length;
    const texts = [...document.querySelectorAll("text")].filter((t) => !t.closest('g[data-kit="composer-float"]')).map((t) => ({ t, f: frameOf(t), b: R(t) })).filter((x) => x.b.width > 0 && x.f);
    const rects = [...document.querySelectorAll("rect")].filter((r) => filled(r) && !r.closest('g[data-kit^="button-"]') && frameOf(r))
      .map((r) => ({ r, f: frameOf(r), b: R(r) })).filter((x) => x.b.width >= 60 && x.b.height >= 50 && !(x.b.width >= 370 && x.b.height >= 600));
    for (const x of btns) {
      const fb = R(x.f.querySelector(":scope > rect")); const at = `кадр ${Math.round(fb.left)},${Math.round(fb.top)} · ${x.k} «${(x.g.textContent || "").trim().slice(0, 24)}» (${Math.round(x.b.left - fb.left)},${Math.round(x.b.top - fb.top)})`;
      const alone = !btns.some((o) => o !== x && o.f === x.f && Math.abs(o.b.top - x.b.top) < 3);
      if (alone) {
        const cap = texts.filter((t) => t.f === x.f && !x.g.contains(t.t) && t.b.top >= x.b.bottom - 2 && t.b.top <= x.b.bottom + 30 && t.b.right > x.b.left && t.b.left < x.b.right).sort((a, c) => a.b.top - c.b.top)[0];
        if (cap) {
          const off = Math.abs(cap.b.left + cap.b.width / 2 - (x.b.left + x.b.width / 2)), edge = Math.abs(cap.b.left - x.b.left);
          if (off > 3 && edge > 3) out.issues.push(`${at}: подпись «${cap.t.textContent.trim().slice(0, 30)}» сдвинута от центра на ${off.toFixed(0)} px`);
        }
      }
      const box = rects.filter((r) => r.f === x.f && r.b.left <= x.b.left + 0.5 && r.b.right >= x.b.right - 0.5 && r.b.top <= x.b.top + 0.5 && r.b.bottom >= x.b.bottom - 0.5)
        .sort((a, c) => a.b.width * a.b.height - c.b.width * c.b.height)[0];
      if (box) {
        const bottom = box.b.bottom - x.b.bottom, side = Math.min(x.b.left - box.b.left, box.b.right - x.b.right);
        if (bottom < 15.5 && box.b.bottom < fb.bottom - 1) out.issues.push(`${at}: до низа блока ${bottom.toFixed(0)} px, нужно 16`);
        if (side < 11.5) out.issues.push(`${at}: до бока блока ${side.toFixed(0)} px, нужно 12`);
      }
    }
    return out;
  });
  await page.close();
  const unique = [...new Set(found.issues)]; problems += unique.length; buttons += found.n;
  console.log(`  ${unique.length ? "✗" : "✓"} ${file.padEnd(26)} кнопок ${found.n}${unique.length ? `, дефектов ${unique.length}` : ""}`);
  for (const l of unique) console.log(`      ${l}`);
}
await browser.close(); server.close();
console.log(problems ? `✗ листов: ${files.length}, кнопок: ${buttons} — дефектов отступа: ${problems}` : `листов: ${files.length}, кнопок: ${buttons} — подписи под кнопками по центру, до краёв блока не меньше 16/12`);
process.exit(problems ? 1 : 0);
