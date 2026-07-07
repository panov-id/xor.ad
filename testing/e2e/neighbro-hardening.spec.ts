import { test, expect } from "@playwright/test";
import { NEIGHBRO_URL } from "../helpers/env";

// The legal page's markdown renderer and the focus styling are neighbro-only
// hardening (review-checklist items 3 and 4).
test.describe("neighbro hardening", () => {
  test("legal markdown renderer drops dangerous link schemes (XSS)", async ({ page }) => {
    await page.goto(`${NEIGHBRO_URL}/legal.html`);
    await page.waitForFunction(() => typeof (window as any).renderMd === "function");

    const html: string = await page.evaluate(() =>
      (window as any).renderMd(
        "[evil](javascript:alert(1)) [data](data:text/html,x) [ok](https://example.com) [rel](/privacy)",
      ),
    );

    // No executable scheme survives, and the dangerous links carry no href.
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    // Safe links are preserved.
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('href="/privacy"');
  });

  test("landing sets a CSP and loads with no CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (m) => {
      if (/content security policy/i.test(m.text())) violations.push(m.text());
    });

    await page.goto(NEIGHBRO_URL);
    await page.waitForLoadState("networkidle");

    // The policy is present…
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
    expect(csp).toContain("default-src 'self'");
    // …and nothing on the page (fonts, config.js, inline scripts, fetches) trips it.
    expect(violations, violations.join("\n")).toHaveLength(0);
  });

  test("legal falls back to English when a translation is missing", async ({ page }) => {
    // Simulate the RU terms file being unavailable.
    await page.route("**/legal/terms_RU.md", (r) => r.fulfill({ status: 404, body: "" }));
    await page.goto(`${NEIGHBRO_URL}/legal.html?doc=terms&lang=ru`);

    // The English terms render (a heading appears) instead of an error.
    await expect(page.locator("#doc h1")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#doc")).not.toContainText("Could not load");
  });

  test("waitlist form has accessible labelling", async ({ page }) => {
    await page.goto(NEIGHBRO_URL);
    const input = page.locator('form.waitlist-form input[type="email"]').first();
    // i18n applies an aria-label (the input has no visible <label>).
    await expect(input).toHaveAttribute("aria-label", /.+/);
    // The status region announces submit results to screen readers.
    await expect(page.locator('[data-status-for="waitlist-form-1"]')).toHaveAttribute("aria-live", "polite");
  });

  test("reduced-motion stops the infinite pulse animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(NEIGHBRO_URL);
    const anim = await page
      .locator(".dot")
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return `${cs.animationName}|${cs.animationIterationCount}|${cs.animationDuration}`;
      });
    const [name, iter] = anim.split("|");
    // Either the animation is removed, or it runs once with ~no duration.
    expect(name === "none" || iter === "1", `computed animation: ${anim}`).toBeTruthy();
  });

  test("focusing the waitlist field shows a visible outline (a11y)", async ({ page }) => {
    await page.goto(NEIGHBRO_URL);
    const form = page.locator("form.waitlist-form").first();
    await form.locator('input[type="email"]').focus();

    // :focus-within surfaces the accent outline on the borderless pill.
    const width = await form.evaluate((el) => parseFloat(getComputedStyle(el).outlineWidth));
    expect(width).toBeGreaterThan(0);
  });
});
