#!/usr/bin/env bash
# Rebuild app/public/geo/<lat>_<lon>.json: Natural Earth land (public domain) cut into 1°x1° tiles for the place map
# (app/src/screens/me/place-map.ts). Runs in a node container (mapshaper simplifies, a small clipper cuts); nothing is
# installed on the host. A tile holds rings in thousandths of a degree from its south-west corner: {"r":[[x,y,x,y,...]]}.
# A cell with no land has no file — the map draws it as sea. Usage: build-land.sh [10m|50m]
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
scale="${1:-10m}"
out="$root/app/public/geo"
mkdir -p "$out"
find "$out" -maxdepth 1 -name '*.json' -delete
docker run --rm -i -u "$(id -u):$(id -g)" -e HOME=/tmp -e SCALE="$scale" -v "$out:/out" node:22-bookworm-slim bash -s <<'EOF'
set -euo pipefail
cd /tmp
npm i -s --no-audit --no-fund mapshaper@0.6.102 >/dev/null
node -e '
fetch(`https://naciscdn.org/naturalearth/${process.env.SCALE}/physical/ne_${process.env.SCALE}_land.zip`)
  .then((r) => { if (!r.ok) throw new Error(`download ${r.status}`); return r.arrayBuffer(); })
  .then((b) => require("fs").writeFileSync("land.zip", Buffer.from(b)));'
npx mapshaper land.zip -o format=geojson precision=0.001 land.json
cat > cut.js <<'JS'
const fs = require("fs");
// The zip may hold more than one layer (mapshaper then writes land1.json, land2.json, ...): read them all.
const feats = fs.readdirSync(".").filter((n) => /^land\d*\.json$/.test(n))
  .flatMap((n) => JSON.parse(fs.readFileSync(n, "utf8")).features ?? []);
const rings = [];
for (const f of feats) {
  const geo = f.geometry; if (!geo) continue;
  const polys = geo.type === "Polygon" ? [geo.coordinates] : geo.coordinates;
  for (const p of polys) for (const r of p) rings.push(r);
}
// Sutherland–Hodgman against one edge of the cell.
function clip(pts, inside, cross) {
  const res = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ia = inside(a), ib = inside(b);
    if (ia) res.push(a);
    if (ia !== ib) res.push(cross(a, b));
  }
  return res;
}
const at = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
function cut(r, x0, y0) {
  const x1 = x0 + 1, y1 = y0 + 1;
  let p = r;
  p = clip(p, (q) => q[0] >= x0, (a, b) => at(a, b, (x0 - a[0]) / (b[0] - a[0])));
  p = clip(p, (q) => q[0] <= x1, (a, b) => at(a, b, (x1 - a[0]) / (b[0] - a[0])));
  p = clip(p, (q) => q[1] >= y0, (a, b) => at(a, b, (y0 - a[1]) / (b[1] - a[1])));
  p = clip(p, (q) => q[1] <= y1, (a, b) => at(a, b, (y1 - a[1]) / (b[1] - a[1])));
  return p;
}
const tiles = new Map();
for (const r of rings) {
  const pts = r.slice(0, -1);
  let a = 180, b = -180, c = 90, d = -90;
  for (const [x, y] of pts) { a = Math.min(a, x); b = Math.max(b, x); c = Math.min(c, y); d = Math.max(d, y); }
  // Natural Earth's "Null Island", a few metres square at 0°,0°: not land anyone stands on.
  if (Math.abs(a) < 0.01 && Math.abs(b) < 0.01 && Math.abs(c) < 0.01 && Math.abs(d) < 0.01) continue;
  for (let y0 = Math.floor(c); y0 <= Math.min(89, Math.floor(d)); y0++)
    for (let x0 = Math.floor(a); x0 <= Math.min(179, Math.floor(b)); x0++) {
      const p = cut(pts, x0, y0);
      if (p.length < 3) continue;
      const flat = [];
      for (const [x, y] of p) {
        const q = [Math.round((x - x0) * 1000), Math.round((y - y0) * 1000)];
        if (flat.length && flat[flat.length - 2] === q[0] && flat[flat.length - 1] === q[1]) continue;
        flat.push(q[0], q[1]);
      }
      if (flat.length < 6) continue;
      // A concave ring clipped this way leaves zero-width runs along the cell's edge: a cell of open sea next to a
      // continent gets a "ring" with no area. Keep only rings that enclose something (in thousandths², twice the area).
      let s = 0;
      for (let i = 0; i < flat.length; i += 2) {
        const j = (i + 2) % flat.length;
        s += flat[i] * flat[j + 1] - flat[j] * flat[i + 1];
      }
      if (Math.abs(s) < 2) continue;
      const k = `${y0}_${x0}`;
      if (!tiles.has(k)) tiles.set(k, []);
      tiles.get(k).push(flat);
    }
}
let bytes = 0;
for (const [k, r] of tiles) { const s = JSON.stringify({ r }); bytes += s.length; fs.writeFileSync(`/out/${k}.json`, s); }
console.log(`tiles ${tiles.size}, bytes ${bytes}`);
JS
node cut.js
EOF
