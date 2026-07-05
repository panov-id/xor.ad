// Invites a new panel user (admin or moderator) by email.
//
// Runs server-side with the service role key, which must never be shipped
// to the browser: it verifies the caller is already an admin, creates the
// invited auth user and a one-time sign-in link (no SMTP/email involved),
// inserts the panel_users row with the requested role, and returns the
// link so the admin can copy and send it themselves through any channel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "http://localhost:5173";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }
  const callerJwt = authHeader.replace("Bearer ", "");

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerUser, error: callerError } = await adminClient.auth.getUser(callerJwt);
  if (callerError || !callerUser?.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });
  }

  const { data: callerRow, error: callerRowError } = await adminClient
    .from("panel_users")
    .select("role")
    .eq("id", callerUser.user.id)
    .single();

  if (callerRowError || callerRow?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Only admins can invite panel users" }), { status: 403 });
  }

  const { email, role } = await req.json();
  if (!email || !["admin", "moderator"].includes(role)) {
    return new Response(JSON.stringify({ error: "email and a valid role are required" }), { status: 400 });
  }

  const { data: invited, error: inviteError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: SITE_URL },
  });

  if (inviteError || !invited?.user || !invited?.properties?.action_link) {
    return new Response(JSON.stringify({ error: inviteError?.message ?? "Invite failed" }), { status: 500 });
  }

  const { error: insertError } = await adminClient
    .from("panel_users")
    .insert({ id: invited.user.id, email, role });

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ success: true, link: invited.properties.action_link }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
