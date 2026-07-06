import { test, expect } from "@playwright/test";
import { SOSED_URL, NEIGHBRO_URL } from "../helpers/env";
import { findWaitlistRow, deleteWaitlistRow, uniqueEmail } from "../helpers/waitlist";

const faces = [
  { name: "sosed.place", url: SOSED_URL, source: "sosed.place-landing" },
  { name: "neighbro.place", url: NEIGHBRO_URL, source: "neighbro.place-landing" },
];

for (const face of faces) {
  test.describe(`${face.name} waitlist`, () => {
    test("positive: submitting the form stores the email and shows success", async ({ page }) => {
      const email = uniqueEmail(face.name.split(".")[0]);
      try {
        await page.goto(face.url);
        // Header form (first one on the page).
        const form = page.locator("form.waitlist-form").first();
        await form.locator('input[type="email"]').fill(email);
        await form.locator("button").click();

        // Success shows either the ok status (sosed) or the "you're on the
        // list" panel (neighbro redesign) — guards against the placeholder-URL
        // bug, which would show the error status instead.
        await expect(
          page.locator(
            '[data-status-for="waitlist-form-1"].ok, [data-after-for="waitlist-form-1"].show',
          ),
        ).toBeVisible({ timeout: 15000 });

        // And the row actually reached the shared backend, with the right source.
        const row = await findWaitlistRow(email);
        expect(row, "waitlist row should exist in the backend").toBeTruthy();
        expect(row?.source).toBe(face.source);
      } finally {
        await deleteWaitlistRow(email);
      }
    });

    test("negative: a backend failure shows the error status, not success", async ({ page }) => {
      await page.goto(face.url);
      // Force the insert to fail at the network layer.
      await page.route("**/rest/v1/waitlist", (route) => route.abort());

      const email = uniqueEmail(`${face.name.split(".")[0]}-fail`);
      const form = page.locator("form.waitlist-form").first();
      await form.locator('input[type="email"]').fill(email);
      await form.locator("button").click();

      const status = page.locator('[data-status-for="waitlist-form-1"]');
      await expect(status).toHaveClass(/err/, { timeout: 15000 });

      // Nothing should have been stored.
      const row = await findWaitlistRow(email);
      expect(row, "no row should exist after a failed submit").toBeFalsy();
    });

    test("negative: an empty email is blocked by the browser (no request sent)", async ({ page }) => {
      await page.goto(face.url);
      let posted = false;
      page.on("request", (r) => {
        if (r.url().includes("/rest/v1/waitlist")) posted = true;
      });

      const form = page.locator("form.waitlist-form").first();
      await form.locator("button").click(); // submit with empty required field

      await page.waitForTimeout(500);
      expect(posted, "no POST should fire for an empty required email").toBe(false);
    });
  });
}
