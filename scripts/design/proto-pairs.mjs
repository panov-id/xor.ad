// Pairs of shots: each prototype screen (docs/newdesign/proto/<id>.html, the ids from its index.json) next to the app's
// shot of the same state (APP_SHOTS/<id>.png, written by the crowd's pairShot). Shoots the prototype under THEME (sea by default)
// at 390x844, writes OUT/index.html (the pairs side by side) and OUT/summary.txt ("pairs N of M" and the ids missing),
// exit 0 when every id has both shots, 1 when not. Run by scripts/design/proto-pairs.sh inside the Playwright image.
//
//   PROTO=/proto APP_SHOTS=/app OUT=/out node proto-pairs.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

/** The prototype's screen ids, in the index's order: the set the goal counts (148), never typed in. */
export function protoIds(index) {
  return index.screens.map((s) => s.id);
}

/** Which ids have an app shot: `has(id)` answers for one. */
export function pairCount(ids, has) {
  const missing = ids.filter((id) => !has(id));
  return { total: ids.length, paired: ids.length - missing.length, missing };
}

export function summaryText(c) {
  return `pairs ${c.paired} of ${c.total}\n` + (c.missing.length ? `missing: ${c.missing.join(" ")}\n` : "");
}

function gallery(ids, has) {
  const row = (id) => `<figure><figcaption>${id}</figcaption><img src="proto/${id}.png" alt="">` +
    (has(id) ? `<img src="app/${id}.png" alt="">` : `<div class="none">no app shot</div>`) + `</figure>`;
  return `<!doctype html><meta charset="utf-8"><title>Proto pairs</title><style>body{font:14px sans-serif;margin:16px}` +
    `figure{display:inline-block;margin:8px;vertical-align:top}img,.none{width:195px;height:422px;margin-right:4px;border:1px solid #888}` +
    `.none{display:inline-flex;align-items:center;justify-content:center;color:#c00}</style>${ids.map(row).join("")}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const THEME = process.env.THEME ?? "sea"; // the crowd's first person: a light device, theme «colour» → sea
  const PROTO = process.env.PROTO ?? "/proto", APP = process.env.APP_SHOTS ?? "/app", OUT = process.env.OUT ?? "/out";
  const ids = protoIds(JSON.parse(readFileSync(`${PROTO}/index.json`, "utf8")));
  const has = (id) => existsSync(`${APP}/${id}.png`);
  mkdirSync(`${OUT}/proto`, { recursive: true });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const css = readFileSync(`${PROTO}/tokens.css`, "utf8");
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  for (const id of ids) {
    await page.setContent(`<!doctype html><html data-theme="${THEME}"><head><meta charset="utf-8"><style>${css} body{margin:0}</style></head>` +
      `<body>${readFileSync(`${PROTO}/${id}.html`, "utf8")}</body></html>`);
    await page.waitForTimeout(400); // past the entry animations' first frames
    await page.screenshot({ path: `${OUT}/proto/${id}.png` });
  }
  await browser.close();
  const c = pairCount(ids, has);
  writeFileSync(`${OUT}/index.html`, gallery(ids, has));
  writeFileSync(`${OUT}/summary.txt`, summaryText(c));
  process.stdout.write(summaryText(c));
  process.exit(c.missing.length ? 1 : 0);
}
