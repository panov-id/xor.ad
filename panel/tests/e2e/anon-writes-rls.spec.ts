import { test, expect, request } from "@playwright/test";
import { adminClient } from "../helpers/admin";
import { SUPABASE_URL, ANON_KEY } from "../helpers/env";

// The landing pages write to waitlist/push_subscriptions with the anon key.
// These check the audited RLS + tightened grants: anon may only INSERT, never
// read/update/delete; panel reads go through authenticated SELECT policies.
const rest = (table: string) => `${SUPABASE_URL}/rest/v1/${table}`;
const anon = { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` };

test.describe("anon write access (waitlist / push_subscriptions)", () => {
  test("anon can insert a push subscription but cannot read it back", async () => {
    const ctx = await request.newContext();
    const endpoint = `https://push.test/anon-${Date.now()}`;
    try {
      const ins = await ctx.fetch(rest("push_subscriptions"), {
        method: "POST",
        headers: { ...anon, "Content-Type": "application/json", Prefer: "return=minimal" },
        data: { endpoint, p256dh: "p", auth: "a", source: "neighbro.place-landing", lang: "en" },
      });
      expect(ins.status(), `insert: ${await ins.text()}`).toBe(201);

      // No SELECT grant + no anon read policy → never returns rows.
      const read = await ctx.fetch(`${rest("push_subscriptions")}?select=*`, { headers: anon });
      const body = await read.json();
      expect(Array.isArray(body) ? body.length : 0).toBe(0);
    } finally {
      await adminClient.from("push_subscriptions").delete().eq("endpoint", endpoint);
      await ctx.dispose();
    }
  });

  test("anon cannot update or delete a waitlist row (privileges revoked)", async () => {
    const ctx = await request.newContext();
    const email = `anon-rls-${Date.now()}@e2e.test`;
    await adminClient.from("waitlist").insert({ email, source: "neighbro.place-landing" });
    try {
      const upd = await ctx.fetch(`${rest("waitlist")}?email=eq.${email}`, {
        method: "PATCH",
        headers: { ...anon, "Content-Type": "application/json" },
        data: { source: "hacked" },
      });
      expect(upd.status(), `update should be denied: ${upd.status()}`).toBeGreaterThanOrEqual(400);

      const del = await ctx.fetch(`${rest("waitlist")}?email=eq.${email}`, {
        method: "DELETE",
        headers: anon,
      });
      expect(del.status(), `delete should be denied: ${del.status()}`).toBeGreaterThanOrEqual(400);

      // The row is untouched.
      const { data } = await adminClient
        .from("waitlist")
        .select("source")
        .eq("email", email)
        .maybeSingle();
      expect(data?.source).toBe("neighbro.place-landing");
    } finally {
      await adminClient.from("waitlist").delete().eq("email", email);
      await ctx.dispose();
    }
  });
});
