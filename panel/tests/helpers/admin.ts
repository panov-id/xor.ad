import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_URL,
  SERVICE_ROLE_KEY,
  ADMIN_EMAIL,
  MODERATOR_EMAIL,
  OUTSIDER_EMAIL,
} from "./env";

export const adminClient: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function ensureUser(email: string): Promise<string> {
  // inviteUserByEmail/createUser is idempotent-ish; find existing first.
  const { data: list } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed for ${email}: ${error?.message}`);
  return data.user.id;
}

export async function seedTestData() {
  // Panel users: an admin, a moderator, and an outsider (auth user with no
  // panel_users row) to exercise role checks and RLS.
  const adminId = await ensureUser(ADMIN_EMAIL);
  const moderatorId = await ensureUser(MODERATOR_EMAIL);
  await ensureUser(OUTSIDER_EMAIL); // no panel_users row on purpose

  await adminClient.from("panel_users").upsert([
    { id: adminId, email: ADMIN_EMAIL, role: "admin" },
    { id: moderatorId, email: MODERATOR_EMAIL, role: "moderator" },
  ]);

  // Waitlist rows from both faces, with a marker so cleanup is targeted.
  await adminClient.from("waitlist").delete().like("email", "%@test.seed");
  await adminClient.from("waitlist").insert([
    { email: "alice@test.seed", source: "sosed.place-landing", early_access: true },
    { email: "bob@test.seed", source: "neighbro.place-landing", early_access: true },
  ]);
}

export async function generateMagicLink(email: string, redirectTo: string): Promise<string> {
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error || !data.properties?.action_link) {
    throw new Error(`generateLink failed for ${email}: ${error?.message}`);
  }
  return data.properties.action_link;
}

// Removes any panel user this invite test created, so re-runs stay clean.
export async function removePanelUserByEmail(email: string) {
  const { data: list } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = list?.users.find((u) => u.email === email);
  if (!user) return;
  await adminClient.from("panel_users").delete().eq("id", user.id);
  await adminClient.auth.admin.deleteUser(user.id);
}
