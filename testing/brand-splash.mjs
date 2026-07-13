import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Brand + splash-logo verification for the neighbro landing.
// For a spread of languages (Latin / Cyrillic / Greek / Georgian) captures:
//   1. the splash while it is on screen — to check the filled badge logo and
//      the brand wordmark render as canonical "NEIGHBRO";
//   2. the header after the splash clears — to check the header brand text.
// Accent is pinned per shot for reproducibility; both color schemes covered.

const file = "/sites/neighbro/index.html";
const langs = ["en", "ru", "el", "ka", "uk", "kk"];
const schemes = ["dark", "light"];
const accentIndex = 0; // pin a stable accent so shots are reproducible
const outDir = "/app/screenshots";

const run = async () => {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();

  for (const lang of langs) {
    for (const scheme of schemes) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        colorScheme: scheme,
        locale: lang,
      });
      const page = await context.newPage();
      // Pin language + accent before first paint so the splash is deterministic.
      await page.addInitScript(
        ([lang, accentIndex]) => {
          localStorage.setItem("lang", lang);
          localStorage.setItem("nb-accent", String(accentIndex));
        },
        [lang, accentIndex],
      );
      await page.goto(`file://${file}`);
      await page.waitForTimeout(300);

      // The splash badge+wordmark block (.bm) fades in over the disc; in headless
      // its animated grid slot lands off-viewport, so a full-page shot misses it.
      // Force it visible with its disc background and element-screenshot it — this
      // reliably captures the filled two-tone badge and the canonical wordmark.
      await page.evaluate(() => {
        const bm = document.querySelector("#splash .bm");
        if (!bm) return;
        bm.style.setProperty("opacity", "1", "important");
        bm.style.setProperty("transform", "none", "important");
        bm.style.setProperty("animation", "none", "important");
        bm.style.setProperty("background", "var(--bg)", "important");
        bm.style.setProperty("padding", "44px 56px", "important");
      });
      await page.waitForTimeout(100);
      const bm = await page.$("#splash .bm");
      if (bm) await bm.screenshot({ path: path.join(outDir, `brand-splash-${lang}-${scheme}.png`) });
      console.log(`saved brand-splash-${lang}-${scheme}.png`);

      // Let the splash clear, then capture the header brand.
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(outDir, `brand-header-${lang}-${scheme}.png`) });
      console.log(`saved brand-header-${lang}-${scheme}.png`);

      await context.close();
    }
  }

  await browser.close();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
