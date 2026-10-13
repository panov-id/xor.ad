// Renders the walk's SVGs (svg-walk.sh) to JPEG beside them, for a pair of eyes to leaf through:
// each <brand>-<width>/NNN-*.svg → NNN-*.jpg at its own width (1440 at half scale). Run in the textwalk image:
//   docker run --rm -v <walk dir>:/svg xor-textwalk:1.48.2 node /walk/svg-to-jpg.mjs
import { chromium } from "playwright";
import { readdirSync } from "node:fs";
const b = await chromium.launch();
let n = 0;
for (const dir of readdirSync("/svg").filter((d) => /-\d+$/.test(d))) {
  const w = Number(dir.split("-").pop());
  const scale = w > 2000 ? 0.375 : w > 1000 ? 0.5 : 1;
  const ctx = await b.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: scale });
  const p = await ctx.newPage();
  for (const f of readdirSync(`/svg/${dir}`).filter((x) => x.endsWith(".svg")).sort()) {
    try {
      await p.goto(`file:///svg/${dir}/${encodeURIComponent(f)}`);
      // fullPage hangs on an SVG document: size the window to the drawing's own height instead
      const h = Math.min(Number(await p.evaluate(() => document.documentElement.getAttribute("height"))) || 900, 8000);
      await p.setViewportSize({ width: w, height: Math.ceil(h) }); await p.waitForTimeout(150);
      await p.screenshot({ path: `/svg/${dir}/${f.replace(/\.svg$/, ".jpg")}`, type: "jpeg", quality: 70, timeout: 20000 });
      n++;
    } catch (e) {
      const h = await p.evaluate(() => document.documentElement.getAttribute("height")).catch(() => "?");
      console.log(`FAILED ${dir}/${f} (height ${h}): ${String(e).split("\n")[0].slice(0, 100)}`);
    }
  }
  await ctx.close();
}
await b.close();
console.log(`rendered ${n}`);
