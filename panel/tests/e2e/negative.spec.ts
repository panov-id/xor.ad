import { test, expect, request } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { generateMagicLink, adminClient, removePanelUserByEmail } from "../helpers/admin";
import {
  PANEL_URL,
  SUPABASE_URL,
  ANON_KEY,
  ADMIN_EMAIL,
  MODERATOR_EMAIL,
  OUTSIDER_EMAIL,
} from "../helpers/env";

const INVITE_FN = `${SUPABASE_URL}/functions/v1/invite-panel-user`;

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

  test("authenticated outsider (no panel_users row) is blocked from the panel UI", async ({ page }) => {
    // A valid session is not enough: consume a real magic link for the
    // outsider, then check() must reject a non-panel user — logout and
    // redirect to /login, leaking no panel content into the UI.
    const link = await generateMagicLink(OUTSIDER_EMAIL, PANEL_URL);
    await page.goto(link);

    await page.waitForURL(/\/login(\?|$)/, { timeout: 15000 });
    await expect(page.getByRole("button", { name: /sign-in link/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Panel users" })).toHaveCount(0);
  });

  test("login for an unknown email creates no auth user (shouldCreateUser:false)", async ({ page }) => {
    const unknown = "nobody-login-probe@test.seed";
    await removePanelUserByEmail(unknown); // ensure a clean slate

    await page.goto(`${PANEL_URL}/login`);
    await page.getByPlaceholder("your email").fill(unknown);
    await page.getByRole("button", { name: /sign-in link/i }).click();

    // Anti-enumeration: the UI confirms regardless of whether the email exists.
    await expect(page.getByText(/for a sign-in link/i)).toBeVisible();

    // But no auth user must have been created for the unknown email.
    const { data } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
    expect(data?.users.some((u) => u.email === unknown)).toBe(false);
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

  test("invite Edge Function is CORS-enabled for the panel origin", async () => {
    const ctx = await request.newContext();
    // The preflight succeeds (the Kong gateway answers it in this stack).
    const pre = await ctx.fetch(INVITE_FN, {
      method: "OPTIONS",
      headers: {
        Origin: PANEL_URL,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    });
    expect(pre.status(), `preflight status=${pre.status()}`).toBeLessThan(300);

    // The function's own responses carry the CORS allow-origin header, so a
    // cross-origin browser call can read them (checked on the 401 path).
    const post = await ctx.fetch(INVITE_FN, {
      method: "POST",
      headers: { Origin: PANEL_URL, "Content-Type": "application/json" },
      data: {},
    });
    expect(post.status()).toBe(401);
    expect(post.headers()["access-control-allow-origin"]).toBe("*");
    await ctx.dispose();
  });

  test("invite normalizes the email and rejects a re-invite (409, not 500)", async ({ page }) => {
    const mixed = "  ReInvite-Probe@Test.Seed  ";
    const normalized = "reinvite-probe@test.seed";
    await removePanelUserByEmail(normalized); // clean slate for re-runs
    await loginAs(page, ADMIN_EMAIL);

    const call = (email: string) =>
      page.evaluate(async (email) => {
        const raw = Object.keys(localStorage)
          .filter((k) => k.includes("auth-token"))
          .map((k) => localStorage.getItem(k))[0];
        const token = raw ? JSON.parse(raw).access_token : null;
        const res = await fetch(`${location.origin.replace("5173", "8000")}/functions/v1/invite-panel-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email, role: "moderator" }),
        });
        return { status: res.status, body: await res.json() };
      }, email);

    const first = await call(mixed);
    expect(first.status, `first invite: ${JSON.stringify(first)}`).toBe(200);

    // The stored row uses the trimmed + lowercased email.
    const { data } = await adminClient.from("panel_users").select("email").eq("email", normalized);
    expect(data?.length).toBe(1);

    // A second invite of the same identity is a conflict, answered clearly.
    const second = await call(mixed);
    expect(second.status, `second invite: ${JSON.stringify(second)}`).toBe(409);

    await removePanelUserByEmail(normalized);
  });
});
