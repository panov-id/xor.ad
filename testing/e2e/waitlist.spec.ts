import { expect, type Page, test } from "@playwright/test";
import { SOSED_URL, NEIGHBRO_URL } from "../helpers/env";
import { findWaitlistRow, uniqueEmail } from "../helpers/waitlist";

// The landing posts same-origin (config.js keeps apiUrl empty locally), so the
// gateway is what carries this path to the relay stand.
const WAITLIST_ROUTE = "**/waitlist";

// The two faces do not share markup — sosed's form is `#wl` with a `#st` status,
// neighbro's is `#waitlist-form-1` with a `data-status-for` sibling — so the
// selectors belong to the face rather than to the test. What they say, however,
// is the same on both: `.ok` on success and `.err` on failure. That agreement is
// what lets the assertions below be one set rather than two.
interface Face {
  name: string;
  url: string;
  source: string;
  form: string;
  status: string;
  success: string;
  // Both landings remember a completed signup and replace the form with a
  // "you're on the list" state. A test that wants the form back has to forget it.
  doneKey: string;
}

const faces: Face[] = [
  {
    name: "sosed.place",
    url: SOSED_URL,
    source: "sosed.place-landing",
    form: "form.wl#wl",
    status: "#st",
    success: "#st.ok",
    doneKey: "ss-wl-done",
  },
  {
    name: "neighbro.place",
    url: NEIGHBRO_URL,
    source: "neighbro.place-landing",
    form: "form#waitlist-form-1",
    status: '[data-status-for="waitlist-form-1"]',
    success:
      '[data-status-for="waitlist-form-1"].ok, [data-after-for="waitlist-form-1"].show',
    doneKey: "nb-wl-done",
  },
];

async function submit(page: Page, face: Face, email: string) {
  const form = page.locator(face.form);
  await form.locator('input[type="email"]').fill(email);
  await form.locator("button").click();
}

for (const face of faces) {
  test.describe(`${face.name} waitlist`, () => {
    test("positive: submitting the form stores the email and shows success", async ({ page }) => {
      const email = uniqueEmail(face.name.split(".")[0]);
      await page.goto(face.url);
      await submit(page, face, email);

      await expect(page.locator(face.success)).toBeVisible({ timeout: 15000 });

      // And the lead actually reached the node, with the right source — which is
      // what decides the brand it landed under.
      const row = await findWaitlistRow(email);
      expect(row, "waitlist row should exist in the backend").toBeTruthy();
      expect(row?.source).toBe(face.source);
    });

    test("positive: re-submitting an existing email still shows success", async ({ page }) => {
      const email = uniqueEmail(`${face.name.split(".")[0]}-dup`);
      await page.goto(face.url);
      await submit(page, face, email);
      await expect(page.locator(face.success)).toBeVisible({ timeout: 15000 });

      // Forget the signup so the form comes back — otherwise the landing shows
      // the joined state and there is nothing left to submit.
      await page.evaluate((key) => localStorage.removeItem(key), face.doneKey);
      await page.reload();

      // The node dedups on the hashed email and answers 200 { duplicate: true },
      // so the second submit must read as success, never as a failure.
      await submit(page, face, email);
      await expect(page.locator(face.success)).toBeVisible({ timeout: 15000 });

      // One lead survives both submits.
      expect(await findWaitlistRow(email), "one deduped row should exist").toBeTruthy();
    });

    test("negative: a backend failure shows the error status, not success", async ({ page }) => {
      await page.goto(face.url);
      await page.route(WAITLIST_ROUTE, (route) => route.abort());

      const email = uniqueEmail(`${face.name.split(".")[0]}-fail`);
      await submit(page, face, email);
      await expect(page.locator(face.status)).toHaveClass(/err/, { timeout: 15000 });
      await expect(page.locator(face.success)).toHaveCount(0);

      // Nothing should have been stored.
      expect(await findWaitlistRow(email), "no row should exist after a failed submit").toBeFalsy();
    });

    test("negative: an empty email is blocked by the browser (no request sent)", async ({ page }) => {
      await page.goto(face.url);
      let posted = false;
      page.on("request", (request) => {
        if (request.url().endsWith("/waitlist")) posted = true;
      });

      await page.locator(face.form).locator("button").click(); // required field is empty

      await page.waitForTimeout(500);
      expect(posted, "no POST should fire for an empty required email").toBe(false);
    });
  });
}
