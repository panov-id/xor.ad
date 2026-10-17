// Reads a Dusk sheet (cairo-exported SVG, text outlined into glyph paths) and returns its geometry in CSS px:
//   shapes: filled paths drawn at top level (circles, tiles, buttons, rows) with their bounding boxes
//   lines:  text lines (runs of glyph <use> on one baseline): left ink edge, right ink edge, baseline, ink top
// The sheet is width x height px, viewBox in pt (1 pt = 1.3333 px), so the scale is width / viewBox width.
import { readFileSync } from "node:fs";

function numsOf(d) { return (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) || []).map(Number); }
function bbox(d) {
  // absolute M/L/C/Z only (cairo): every pair of numbers is a point (curve control points sit on the arc's tangents,
  // so the box of a circle or rounded rectangle is exact; a stray control point would only widen it)
  const n = numsOf(d); let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return { x0, y0, x1, y1 };
}
const hex = (rgb) => "#" + (rgb.match(/[\d.]+/g) || []).slice(0, 3).map((p) => Math.round(Number(p) * 2.55).toString(16).padStart(2, "0")).join("");

export function readSheet(file) {
  const svg = readFileSync(file, "utf8");
  const [, w, h] = svg.match(/<svg[^>]* width="([\d.]+)" height="([\d.]+)"/);
  const vb = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"/);
  const k = Number(w) / Number(vb[1]);
  const glyph = {};
  for (const m of svg.matchAll(/<g id="(glyph-\d+-\d+)">\s*([\s\S]*?)<\/g>/g)) {
    const d = m[2].match(/ d="([^"]*)"/);
    glyph[m[1]] = d ? bbox(d[1]) : null;
  }
  const body = svg.slice(svg.indexOf("</defs>"));
  const shapes = [];
  for (const m of body.matchAll(/<path fill-rule="(?:nonzero|evenodd)" fill="([^"]+)" fill-opacity="1" d="([^"]+)"/g)) {
    const b = bbox(m[2]);
    shapes.push({ fill: hex(m[1]), x: b.x0 * k, y: b.y0 * k, w: (b.x1 - b.x0) * k, h: (b.y1 - b.y0) * k });
  }
  // glyph runs: <g fill="..."><use xlink:href="#glyph-a-b" x= y= /></g>, same fill and y within 0.3 pt = one line
  const lines = [];
  for (const m of body.matchAll(/<g fill="([^"]+)" fill-opacity="1">\s*<use xlink:href="#(glyph-\d+-\d+)" x="([\d.]+)" y="([\d.]+)"\/>/g)) {
    const g = glyph[m[2]]; if (!g) continue;
    const x = Number(m[3]), y = Number(m[4]);
    const last = lines[lines.length - 1];
    const box = { x0: x + g.x0, x1: x + g.x1, top: y + g.y0 };
    if (last && last.fill === hex(m[1]) && Math.abs(last.base - y) < 0.3 && x - last.x1 < 100) {
      last.x1 = Math.max(last.x1, box.x1); last.top = Math.min(last.top, box.top); last.n++;
    } else lines.push({ fill: hex(m[1]), base: y, x0: box.x0, x1: box.x1, top: box.top, n: 1 });
  }
  return {
    width: Number(w), height: Number(h),
    shapes: shapes.map((s) => ({ ...s, x: +s.x.toFixed(2), y: +s.y.toFixed(2), w: +s.w.toFixed(2), h: +s.h.toFixed(2) })),
    lines: lines.map((l) => ({ fill: l.fill, n: l.n, left: +(l.x0 * k).toFixed(2), right: +(l.x1 * k).toFixed(2), base: +(l.base * k).toFixed(2), top: +(l.top * k).toFixed(2) })),
  };
}
if (process.argv[2]) console.log(JSON.stringify(readSheet(process.argv[2]), null, 1));
