import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Sites and viewport/color-scheme combinations to cover for responsive +
// dark/light visual checks. Sites are mounted read-only into /sites/<name>.
const sites = [
  { name: "sosed", file: "/sites/sosed/index.html" },
  { name: "neighbro", file: "/sites/neighbro/index.html" },
];

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

const colorSchemes = ["dark", "light"];

const outDir = "/app/screenshots";

const run = async () => {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();

  for (const site of sites) {
    for (const viewport of viewports) {
      for (const scheme of colorSchemes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: scheme,
        });
        const page = await context.newPage();
        await page.goto(`file://${site.file}`);
        await page.waitForTimeout(300); // let the web font settle
        const fileName = `${site.name}-${viewport.name}-${scheme}.png`;
        await page.screenshot({ path: path.join(outDir, fileName), fullPage: true });
        console.log(`saved ${fileName}`);
        await context.close();
      }
    }
  }

  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
