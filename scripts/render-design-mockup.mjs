// Draw a mockup from panel/design at its true geometry. Run through
// scripts/render-design-mockup.sh, which mounts the directories this expects.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join, normalize } from "node:path";

const DESIGN = "/design";
const PANEL_FONTS = "/panel-fonts";
const OUT = "/out";
const PORT = 8322;

const TYPES = {
  ".svg": "image/svg+xml",
  ".html": "text/html; charset=utf-8",
  ".woff2": "font/woff2",
};

// `/fonts/…` is resolved against the design's own faces first — Golos Text and
// JetBrains Mono live only here — and against the panel's afterwards, because
// most mockups are drawn in Inter and Unbounded.
async function locate(path) {
  if (path.startsWith("/fonts/")) {
    const name = basename(path);
    for (const directory of [join(DESIGN, "fonts"), PANEL_FONTS]) {
      try {
        return await readFile(join(directory, name));
      } catch {
        continue;
      }
    }
    return null;
  }
  try {
    return await readFile(join(DESIGN, path));
  } catch {
    return null;
  }
}

const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  const body = await locate(path);
  if (!body) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
  response.end(body);
});
await new Promise((done) => server.listen(PORT, "127.0.0.1", done));

const only = process.env.ONLY || "";
const files = (await readdir(DESIGN))
  .filter((name) => name.endsWith(".svg"))
  .filter((name) => !only || basename(name, ".svg") === only);

if (files.length === 0) {
  console.error(only ? `нет такого мокапа: ${only}` : "в panel/design нет ни одного SVG");
  process.exit(2);
}

const browser = await chromium.launch();
let failures = 0;

for (const file of files) {
  const source = await readFile(join(DESIGN, file), "utf-8");
  const width = Number(/width="(\d+)"/.exec(source)?.[1]);
  const height = Number(/height="(\d+)"/.exec(source)?.[1]);
  if (!width || !height) {
    console.error(`  ✗ ${file}: не нашёл width/height в корневом <svg>`);
    failures++;
    continue;
  }

  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  const missing = [];
  page.on("requestfailed", (request) => missing.push(request.url()));
  page.on("response", (response) => {
    if (response.status() === 404) missing.push(response.url());
  });

  // "load", not "domcontentloaded": the faces are still on their way.
  await page.goto(`http://127.0.0.1:${PORT}/${file}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);

  // Not fullPage: the viewport is already the drawing's own size, and fullPage
  // would add whatever the page grew by.
  await page.screenshot({ path: join(OUT, file.replace(/\.svg$/, ".png")) });
  await context.close();

  const fonts = missing.filter((url) => url.includes("/fonts/"));
  if (fonts.length) failures++;
  console.log(
    `  ${fonts.length ? "✗" : "✓"} ${file.padEnd(26)} ${width}×${height}` +
      (fonts.length ? `  не нашлись шрифты: ${fonts.map((u) => basename(u)).join(", ")}` : ""),
  );
}

await browser.close();
server.close();
process.exit(failures === 0 ? 0 : 1);
