import { test, expect, request } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { generateMagicLink } from "../helpers/admin";
import {
  PANEL_URL,
  SUPABASE_URL,
  ANON_KEY,
  MODERATOR_EMAIL,
  OUTSIDER_EMAIL,
} from "../helpers/env";

test.describe("negative flows", () => {
  test("moderator does not see the invite form", async ({ page }) => {
    await loginAs(page, MODERATOR_EMAIL);
    await page.getByRole("link", { name: "Panel users" }).click();

    await expect(page.getByRole("heading", { name: "Panel users" })).toBeVisible();
    await expect(page.locator(".panel-invite-form")).toHaveCount(0);
    await expect(page.getByText("Only admins can invite")).toBeVisible();
  });

  test("moderator calling the invite Edge Function directly is rejected (403)", async ({ page }) => {
    await loginAs(page, MODERATOR_EMAIL);

    const result = await page.evaluate(async () => {
      // @ts-expect-error injected by the app on window for debugging is not
      // available, so read the persisted session from localStorage instead.
      const raw = Object.keys(localStorage)
        .filter((k) => k.includes("auth-token"))
        .map((k) => localStorage.getItem(k))[0];
      const token = raw ? JSON.parse(raw).access_token : null;
      const res = await fetch(`${location.origin.replace("5173", "8000")}/functions/v1/invite-panel-user`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: "sneaky@test.seed", role: "admin" }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(403);
    expect(result.body.error).toContain("admin");
  });

  test("unauthenticated visitor is redirected to /login", async ({ page }) => {
    await page.goto(`${PANEL_URL}/waitlist`);
    // Refine redirects unauthenticated users to /login?to=<original path>.
    await page.waitForURL(/\/login(\?|$)/, { timeout: 15000 });
    await expect(page.getByRole("button", { name: /sign-in link/i })).toBeVisible();
  });

  test("anon API cannot read panel tables (RLS)", async () => {
    const ctx = await request.newContext();
    for (const table of ["panel_users", "waitlist"]) {
      const res = await ctx.get(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
      });
      const body = await res.json();
      // RLS with no anon SELECT policy → empty array (or an error), never rows.
      expect(Array.isArray(body) ? body.length : 0).toBe(0);
    }
    await ctx.dispose();
  });

  test("authenticated outsider (no panel_users row) reads nothing via API (RLS)", async () => {
    // Establish a real session for the outsider through the verify endpoint.
    const link = await generateMagicLink(OUTSIDER_EMAIL, PANEL_URL);
    const ctx = await request.newContext();
    const verify = await ctx.get(link, { maxRedirects: 0 }).catch(() => null);
    // The redirect Location carries the access_token in the URL hash.
    const location = verify?.headers()["location"] ?? "";
    const hash = location.split("#")[1] ?? "";
    const token = new URLSearchParams(hash).get("access_token");
    expect(token, "outsider should still get an auth token").toBeTruthy();

    const res = await ctx.get(`${SUPABASE_URL}/rest/v1/panel_users?select=*`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(Array.isArray(body) ? body.length : 0).toBe(0);
    await ctx.dispose();
  });

  test("invite Edge Function rejects invalid input (400)", async ({ page }) => {
    const { ADMIN_EMAIL } = await import("../helpers/env");
    await loginAs(page, ADMIN_EMAIL);

    const bad = await page.evaluate(async () => {
      const raw = Object.keys(localStorage)
        .filter((k) => k.includes("auth-token"))
        .map((k) => localStorage.getItem(k))[0];
      const token = raw ? JSON.parse(raw).access_token : null;
      const call = (body: unknown) =>
        fetch(`${location.origin.replace("5173", "8000")}/functions/v1/invite-panel-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        }).then((r) => r.status);

      return {
        emptyEmail: await call({ email: "", role: "moderator" }),
        badRole: await call({ email: "x@test.seed", role: "superuser" }),
      };
    });

    expect(bad.emptyEmail).toBe(400);
    expect(bad.badRole).toBe(400);
  });
});
