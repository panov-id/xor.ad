import { test, expect } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { removePanelUserByEmail } from "../helpers/admin";
import { ADMIN_EMAIL } from "../helpers/env";

const INVITEE = "invited-moderator@test.seed";

test.describe("admin — positive flows", () => {
  test.afterAll(async () => {
    await removePanelUserByEmail(INVITEE);
  });

  test("admin lands on the waitlist and sees seeded rows with per-face badges", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL);

    await expect(page.getByRole("heading", { name: "Waitlist" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "alice@test.seed" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "bob@test.seed" })).toBeVisible();

    // Source is shown as a badge, not raw text.
    await expect(page.locator(".badge-sosed").first()).toBeVisible();
    await expect(page.locator(".badge-neighbro").first()).toBeVisible();
  });

  test("admin can open panel users and sees the invite form", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL);

    await page.getByRole("link", { name: "Panel users" }).click();
    await expect(page.getByRole("heading", { name: "Panel users" })).toBeVisible();

    // Admin sees the invite controls.
    await expect(page.locator(".panel-invite-form")).toBeVisible();
    await expect(page.getByRole("cell", { name: ADMIN_EMAIL })).toBeVisible();
  });

  test("admin invites a moderator and gets a copyable link; the row appears", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL);
    await page.getByRole("link", { name: "Panel users" }).click();

    await page.locator('.panel-invite-form input[type="email"]').fill(INVITEE);
    await page.locator(".panel-invite-form select").selectOption("moderator");
    await page.locator(".panel-invite-form button").click();

    await expect(page.locator(".status-ok")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("cell", { name: INVITEE })).toBeVisible();
    await expect(page.locator(".badge-moderator").last()).toBeVisible();
  });
});
