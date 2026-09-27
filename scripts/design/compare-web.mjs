// How far each web shot is from its phone on a sheet (WD6). Run by
// scripts/check-web-design.sh in the panel-tests-runner image: /shots holds
// the shots and sheets/ (from shoot-web.sh), /map the map, /design the built
// sheets' SVG (for where each phone stands).
//
// A phone on a built sheet is <g transform="translate(X,Y)" class="k-…">
// opening on its 375x812 frame; the sheet PNG is rendered @2x, so the phone is
// the 750x1624 crop at (2X, 2Y), the same size as a shot. The measure is the
// share of pixels whose largest channel differs by more than 48 — coarse (the
// words on a sheet are not the stand's), which is why the gate is a ratchet
// on it rather than a threshold.
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

const PHONE = /<g transform="translate\(([\d.]+),([\d.]+)\)" class="k-(?:dark|light)[^"]*">\s*(?:<rect x="-1" y="-1" width="377" height="814"|<rect (?:x="0" y="0" )?width="375" height="812")/g;
const rows = readFileSync("/map", "utf-8").split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));

const browser = await chromium.launch();
const page = await browser.newPage();
const png = (path) => `data:image/png;base64,${readFileSync(path).toString("base64")}`;
let broken = 0;
for (const [shot, sheet, index] of rows) {
  const phones = [...readFileSync(`/design/${sheet}.svg`, "utf-8").matchAll(PHONE)].map((m) => [Number(m[1]), Number(m[2])]);
  const at = phones[Number(index)];
  const shotFile = `/shots/${shot}.png`;
  const sheetFile = `/shots/sheets/${sheet}.png`;
  if (!at || !existsSync(shotFile) || !existsSync(sheetFile)) {
    console.log(`${shot}\tmissing\t${!at ? `no phone ${index} on ${sheet}` : !existsSync(shotFile) ? "no shot" : "no sheet render"}`);
    broken++;
    continue;
  }
  const share = await page.evaluate(async ({ a, b, x, y }) => {
    const load = (src) => new Promise((done, fail) => { const i = new Image(); i.onload = () => done(i); i.onerror = fail; i.src = src; });
    const [shotImg, sheetImg] = await Promise.all([load(a), load(b)]);
    const w = 750, h = 1624;
    const draw = (img, sx, sy) => {
      const c = new OffscreenCanvas(w, h).getContext("2d");
      c.drawImage(img, sx, sy, w, h, 0, 0, w, h);
      return c.getImageData(0, 0, w, h).data;
    };
    const p = draw(shotImg, 0, 0), q = draw(sheetImg, x * 2, y * 2);
    const far = (d, i, j) => Math.max(Math.abs(d[i] - d[j]), Math.abs(d[i + 1] - d[j + 1]), Math.abs(d[i + 2] - d[j + 2])) > 40;
    let off = 0;
    for (let i = 0; i < p.length; i += 4) if (Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2])) > 48) off++;
    // The content's left edge: in each row, the first pixel away from the
    // ground (the pixel at x=740 of that row stands for it), past the frame's
    // own rim; the edge is the x most rows start at. Words differ between a
    // sheet and the stand, where the content starts does not — so a padding
    // moved by 8 moves this by 8 (16 device pixels).
    const edge = (d) => {
      const count = new Map();
      for (let row = 120; row < h - 140; row++) {
        const ground = (row * w + 740) * 4;
        for (let col = 6; col < 300; col++) {
          if (far(d, (row * w + col) * 4, ground)) { count.set(col, (count.get(col) ?? 0) + 1); break; }
        }
      }
      return [...count.entries()].sort((m, n) => n[1] - m[1])[0]?.[0] ?? 0;
    };
    return { share: off / (w * h), edge: Math.abs(edge(p) - edge(q)) / 2 };
  }, { a: png(shotFile), b: png(sheetFile), x: at[0], y: at[1] });
  console.log(`${shot}\t${(share.share * 100).toFixed(2)}\t${share.edge}`);
}
await browser.close();
process.exit(broken ? 2 : 0);
