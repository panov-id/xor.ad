import { test, expect, request, type Page } from "@playwright/test";
import { loginAs } from "../helpers/auth";
import { adminClient, removePanelUserByEmail } from "../helpers/admin";
import { SUPABASE_URL, ANON_KEY, ADMIN_EMAIL, MODERATOR_EMAIL } from "../helpers/env";

const REST = `${SUPABASE_URL}/rest/v1/panel_users`;

async function accessToken(page: Page, email: string): Promise<string> {
  await loginAs(page, email);
  const token = await page.evaluate(() => {
    const raw = Object.keys(localStorage)
      .filter((k) => k.includes("auth-token"))
      .map((k) => localStorage.getItem(k))[0];
    return raw ? JSON.parse(raw).access_token : null;
  });
  expect(token, "should have an access token after login").toBeTruthy();
  return token as string;
}

async function createTempPanelUser(email: string, role: "admin" | "moderator"): Promise<string> {
  await removePanelUserByEmail(email);
  const { data, error } = await adminClient.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  await adminClient.from("panel_users").insert({ id: data.user.id, email, role });
  return data.user.id;
}

async function panelRole(id: string): Promise<string | null> {
  const { data } = await adminClient.from("panel_users").select("role").eq("id", id).maybeSingle();
  return data?.role ?? null;
}

test.describe("panel_users update/delete RLS + last-admin guard", () => {
  test("admin can promote and delete another panel user", async ({ page }) => {
    const email = "rls-target@test.seed";
    const id = await createTempPanelUser(email, "moderator");
    const token = await accessToken(page, ADMIN_EMAIL);
    const ctx = await request.newContext();
    const headers = { apikey: ANON_KEY, Authorization: `Bearer ${token}` };

    try {
      const patch = await ctx.fetch(`${REST}?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
        data: { role: "admin" },
      });
      expect(patch.ok(), `patch ${patch.status()}`).toBeTruthy();
      expect((await patch.json())[0]?.role).toBe("admin");

      const del = await ctx.fetch(`${REST}?id=eq.${id}`, {
        method: "DELETE",
        headers: { ...headers, Prefer: "return=representation" },
      });
      expect(del.ok(), `delete ${del.status()}`).toBeTruthy();
      expect(await panelRole(id)).toBeNull();
    } finally {
      await ctx.dispose();
      await removePanelUserByEmail(email);
    }
  });

  test("moderator cannot delete a panel user (RLS blocks the row)", async ({ page }) => {
    const email = "rls-protected@test.seed";
    const id = await createTempPanelUser(email, "moderator");
    const token = await accessToken(page, MODERATOR_EMAIL);
    const ctx = await request.newContext();

    try {
      const del = await ctx.fetch(`${REST}?id=eq.${id}`, {
        method: "DELETE",
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, Prefer: "return=representation" },
      });
      // RLS filters the row out of the delete's scope: nothing is removed.
      expect((await del.json()).length).toBe(0);
      expect(await panelRole(id)).toBe("moderator");
    } finally {
      await ctx.dispose();
      await removePanelUserByEmail(email);
    }
  });

  // The "last admin cannot be deleted/demoted" guard is global across the
  // whole table, so it can't be exercised hermetically here (this stack has
  // a real bootstrapped admin besides the seeded one). It is verified against
  // a controlled single-admin state by scripts/test-last-admin-guard.sh.
});
