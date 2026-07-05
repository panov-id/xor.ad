import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { ADMIN_EMAIL } from "../helpers/env";

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];
const schemes = ["dark", "light"] as const;
const pages = [
  { name: "login", authed: false, path: "/login" },
  { name: "waitlist", authed: true, path: "/waitlist" },
  { name: "panel-users", authed: true, path: "/panel-users" },
];

for (const vp of viewports) {
  for (const scheme of schemes) {
    test.describe(`${vp.name} · ${scheme}`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme });

      for (const p of pages) {
        test(`${p.name} — no horizontal overflow + screenshot`, async ({ page }) => {
          if (p.authed) {
            await loginAs(page, ADMIN_EMAIL);
            await page.goto(p.path);
            await page.waitForLoadState("networkidle");
          } else {
            await page.goto(p.path);
          }

          // The page body must never scroll horizontally at any breakpoint.
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, "horizontal overflow in px").toBeLessThanOrEqual(1);

          await page.screenshot({
            path: `screenshots/panel-${p.name}-${vp.name}-${scheme}.png`,
            fullPage: true,
          });
        });
      }
    });
  }
}
