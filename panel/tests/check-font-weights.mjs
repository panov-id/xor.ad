// Every font weight the panel asks for must be a weight the browser can draw.
//
//   node check-font-weights.mjs            (from panel/tests, with playwright installed)
//   scripts/check-panel-font-weights.sh    (the same thing, in Docker)
//
// Why it exists: fonts.css declared Inter at 400 and 500 only, both pointing at
// the same variable file, so `font-weight: 600` and `700` were drawn as
// synthetic bold smeared over the 500 glyphs — identical to each other and to
// 500, all three at 627px. Nothing failed. It just looked slightly wrong, on
// every screen, for months.
//
// Reading the CSS cannot catch it: the declarations looked deliberate. So this
// renders the weights in a real browser and measures them, and two weights the
// panel uses that come out pixel-identical are the defect by definition.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PANEL = resolve(process.env.PANEL_DIR ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
const PORT = Number(process.env.PROBE_PORT ?? 8321);

// Both families: the panel sets --font-body and --font-display from these two,
// and a capped axis in either one is the same defect.
const FAMILIES = ["Inter", "Unbounded"];
// Latin and Cyrillic, because the faces are cut per unicode subset and a subset
// that silently failed to load would otherwise read as a working weight.
const SAMPLES = [
  { label: "latin", text: "Handgloves quickly 0123456789" },
  { label: "cyrillic", text: "Съешь ещё этих мягких булок 0123" },
];

// Read from the panel's own stylesheets rather than listed here, so that a new
// `font-weight: 800` widens this check by itself.
const asked = new Set();
for (const file of ["src/App.css", "ui-kit.html"]) {
  const text = await readFile(join(PANEL, file), "utf-8");
  for (const match of text.matchAll(/font-weight:\s*(\d{3})\b/g)) asked.add(Number(match[1]));
}
const WEIGHTS = [...asked].sort((first, second) => first - second);
if (WEIGHTS.length === 0) {
  console.error("не нашёл ни одного font-weight в вёрстке панели — проверять нечего");
  process.exit(2);
}
console.log(`веса, которые запрашивает вёрстка панели: ${WEIGHTS.join(" ")}`);

const PAGE = `<meta charset="utf-8"><link rel="stylesheet" href="/fonts.css"><body>measured by script</body>`;
const TYPES = { ".css": "text/css; charset=utf-8", ".woff2": "font/woff2" };

const server = createServer(async (request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  if (path === "/" || path === "/index.html") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(PAGE);
    return;
  }
  const file = path.startsWith("/fonts/")
    ? join(PANEL, "public", path)
    : path === "/fonts.css"
    ? join(PANEL, "src/fonts.css")
    : null;
  if (!file) {
    response.writeHead(404).end("not found");
    return;
  }
  try {
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end("not found");
  }
});
await new Promise((done) => server.listen(PORT, "127.0.0.1", done));

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: "load" });

const result = await page.evaluate(
  async ([families, weights, samples]) => {
    // Faces load on demand, not when the stylesheet parses.
    for (const family of families) {
      for (const weight of weights) {
        await document.fonts.load(`${weight} 40px "${family}"`, "Handgloves Съешь");
      }
    }
    const ruler = document.createElement("span");
    ruler.style.cssText = "position:absolute;white-space:pre;font-size:40px";
    document.body.appendChild(ruler);
    const measure = (family, weight, text) => {
      ruler.style.fontFamily = family === "fallback" ? "sans-serif" : `"${family}"`;
      ruler.style.fontWeight = String(weight);
      ruler.textContent = text;
      return Math.round(ruler.getBoundingClientRect().width * 100) / 100;
    };
    const rows = [];
    for (const family of families) {
      for (const sample of samples) {
        for (const weight of weights) {
          rows.push({
            family,
            sample: sample.label,
            weight,
            width: measure(family, weight, sample.text),
          });
        }
      }
    }
    return {
      rows,
      loaded: [...document.fonts].filter((face) => face.status === "loaded").length,
      control: Object.fromEntries(
        [...families, "fallback"].map((family) => [family, measure(family, 400, samples[0].text)]),
      ),
    };
  },
  [FAMILIES, WEIGHTS, SAMPLES],
);

await browser.close();
server.close();

// A page where no font loaded measures the fallback for everything, and the
// fallback has a real bold — so it would pass this check while proving nothing.
if (result.loaded === 0) {
  console.error("ШРИФТЫ НЕ ЗАГРУЗИЛИСЬ — проверять нечего");
  process.exit(2);
}
for (const family of FAMILIES) {
  if (result.control[family] === result.control.fallback) {
    console.error(`${family} рисуется запасным шрифтом — проверять нечего`);
    process.exit(2);
  }
}

let collisions = 0;
for (const family of FAMILIES) {
  for (const sample of SAMPLES) {
    const rows = result.rows.filter((row) => row.family === family && row.sample === sample.label);
    const byWidth = new Map();
    const clashes = [];
    for (const row of rows) {
      const seen = byWidth.get(row.width);
      if (seen !== undefined) clashes.push(`вес ${row.weight} неотличим от ${seen} (оба ${row.width}px)`);
      else byWidth.set(row.width, row.weight);
    }
    collisions += clashes.length;
    // The measurements first, then what is wrong with them — printed to one
    // stream so the two do not interleave in a CI log.
    console.log(
      `  ${clashes.length ? "✗" : "✓"} ${family}/${sample.label}: ` +
        rows.map((row) => `${row.weight}→${row.width}px`).join("  "),
    );
    for (const clash of clashes) console.log(`      ${clash} — ось насыщенности обрезана`);
  }
}

if (collisions > 0) {
  console.error(`\nсовпавших весов: ${collisions}`);
  console.error("Починка: объявить вес диапазоном в panel/src/fonts.css —");
  console.error("пересоздать командой из шапки этого файла (scripts/fetch-fonts.sh).");
  process.exit(1);
}
console.log("\nвсе запрашиваемые веса различимы");
