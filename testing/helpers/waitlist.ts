import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_ROLE_KEY } from "./env";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Reads back a waitlist row by email (service role bypasses RLS), so a test
// can prove the landing submission actually reached the shared backend.
export async function findWaitlistRow(email: string) {
  const { data } = await admin
    .from("waitlist")
    .select("email, source, early_access")
    .eq("email", email)
    .maybeSingle();
  return data;
}

export async function deleteWaitlistRow(email: string) {
  await admin.from("waitlist").delete().eq("email", email);
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;
}
