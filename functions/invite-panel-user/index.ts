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

// Callable from the panel running on a different origin (dev server vs Kong),
// so answer CORS preflight and echo the headers on every response.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Log an unexpected server-side fault into client_errors (shared with the
// frontend logger) so backend errors are visible too. Never throws.
// deno-lint-ignore no-explicit-any
async function logServerError(client: any, kind: string, err: unknown, extra: Record<string, unknown> = {}) {
  try {
    await client.from("client_errors").insert({
      kind,
      message: (err as { message?: string })?.message ?? String(err),
      stack: (err as { stack?: string })?.stack ? String((err as { stack?: string }).stack).slice(0, 2000) : null,
      source: "edge:invite-panel-user",
      extra,
    });
  } catch (_) { /* the logger must never throw */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "Missing Authorization header" }, 401);
  }
  const callerJwt = authHeader.replace("Bearer ", "");

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
  const { data: callerUser, error: callerError } = await adminClient.auth.getUser(callerJwt);
  if (callerError || !callerUser?.user) {
    return json({ error: "Invalid session" }, 401);
  }

  const { data: callerRow, error: callerRowError } = await adminClient
    .from("panel_users")
    .select("role")
    .eq("id", callerUser.user.id)
    .single();

  if (callerRowError || callerRow?.role !== "admin") {
    return json({ error: "Only admins can invite panel users" }, 403);
  }

  const body = await req.json().catch(() => null);
  const rawEmail = typeof body?.email === "string" ? body.email : "";
  const role = body?.role;
  const email = rawEmail.trim().toLowerCase();

  if (!EMAIL_RE.test(email) || !["admin", "moderator"].includes(role)) {
    return json({ error: "A valid email and role (admin or moderator) are required" }, 400);
  }

  // Re-invite guard: an already-registered panel user is an expected
  // conflict, not a server fault. generateLink is idempotent for existing
  // users, so catch this before touching auth.
  const { data: existing } = await adminClient
    .from("panel_users")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return json({ error: `${email} is already invited` }, 409);
  }

  const { data: invited, error: inviteError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: SITE_URL },
  });

  if (inviteError || !invited?.user || !invited?.properties?.action_link) {
    const message = inviteError?.message ?? "Invite failed";
    if (/already|registered|exists/i.test(message)) {
      return json({ error: `${email} is already invited` }, 409);
    }
    return json({ error: message }, 500);
  }

  const { error: insertError } = await adminClient
    .from("panel_users")
    .insert({ id: invited.user.id, email, role });

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    // Lost a race with the guard above (already a panel user): a conflict,
    // and the existing user must NOT be rolled back.
    if (code === "23505" || /duplicate|unique/i.test(insertError.message)) {
      return json({ error: `${email} is already invited` }, 409);
    }
    // The auth user was just created by generateLink; roll it back so a
    // failed insert does not leave an orphaned user with no panel_users row.
    await adminClient.auth.admin.deleteUser(invited.user.id).catch(() => {});
    return json({ error: insertError.message }, 500);
  }

  return json({ success: true, link: invited.properties.action_link }, 200);
  } catch (err) {
    await logServerError(adminClient, "server:invite-panel-user", err, { url: req.url });
    return json({ error: "Internal error" }, 500);
  }
});
