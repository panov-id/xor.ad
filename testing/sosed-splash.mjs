import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Verify the sosed splash fix: the splash must be VISIBLE for ~2s on every
// load, including under prefers-reduced-motion (previously `.splash{display:none}`
// hid it entirely and `hold=reduce?0:...` skipped the timer, so it vanished).
const file = "/sites/sosed/index.html";
const outDir = "/app/screenshots";

const run = async () => {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  let failures = 0;

  for (const motion of ["no-preference", "reduce"]) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "dark",
      reducedMotion: motion,
    });
    const page = await context.newPage();
    await page.goto(`file://${file}`, { waitUntil: "domcontentloaded" });

    // Mid-hold (~1s): splash must be present and visibly covering the viewport.
    await page.waitForTimeout(1000);
    const mid = await page.evaluate(() => {
      const s = document.getElementById("splash");
      if (!s) return { present: false };
      const cs = getComputedStyle(s);
      const r = s.getBoundingClientRect();
      return {
        present: true,
        display: cs.display,
        opacity: cs.opacity,
        covers: r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9,
      };
    });
    const visible = mid.present && mid.display !== "none" && Number(mid.opacity) > 0.5 && mid.covers;
    console.log(`[${motion}] @1s  present=${mid.present} display=${mid.display} opacity=${mid.opacity} covers=${mid.covers} -> ${visible ? "VISIBLE ✓" : "MISSING ✗"}`);
    if (!visible) failures++;
    await page.screenshot({ path: path.join(outDir, `sosed-splash-${motion}-1s.png`) });

    // After the 2s hold + fade: splash must be gone.
    await page.waitForTimeout(1800);
    const cleared = await page.evaluate(() => !document.getElementById("splash"));
    console.log(`[${motion}] @2.8s splash removed=${cleared} -> ${cleared ? "CLEARED ✓" : "STUCK ✗"}`);
    if (!cleared) failures++;
    await page.screenshot({ path: path.join(outDir, `sosed-splash-${motion}-after.png`) });

    await context.close();
  }

  await browser.close();
  console.log(failures ? `\nFAILED · ${failures} check(s)` : `\nOK · splash shows then clears in both motion modes`);
  process.exit(failures ? 1 : 0);
};

run().catch((err) => { console.error(err); process.exit(1); });
