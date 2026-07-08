// Sends the branded "you're on the waitlist" email via the Resend API.
// Called server-side (Supabase DB trigger on waitlist INSERT), guarded by a
// shared secret. Sender/domain are config (function secrets), so this works as
// soon as the sending domain is verified in Resend.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { welcomeEmail } from "./template.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const WELCOME_FROM = Deno.env.get("WELCOME_FROM") ?? "Neighbro <hello@neighbro.place>";
const WELCOME_SECRET = Deno.env.get("WELCOME_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// deno-lint-ignore no-explicit-any
async function logErr(kind: string, err: unknown, extra: Record<string, unknown> = {}) {
  try {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return;
    const c = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    await c.from("client_errors").insert({
      kind, message: (err as { message?: string })?.message ?? String(err),
      stack: (err as { stack?: string })?.stack?.slice(0, 2000) ?? null,
      source: "edge:send-waitlist-welcome", extra,
    });
  } catch (_) { /* never throw */ }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    // Guard: only our DB trigger (which knows the secret) may call this.
    const secret = req.headers.get("x-welcome-secret") ?? body?.secret ?? "";
    if (!WELCOME_SECRET || secret !== WELCOME_SECRET) return json({ error: "Forbidden" }, 403);

    const email = String(body?.email ?? "").trim().toLowerCase();
    const lang = body?.lang;
    if (!EMAIL_RE.test(email)) return json({ error: "Valid email required" }, 400);
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);

    const { subject, html, text } = welcomeEmail(lang);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: WELCOME_FROM, to: [email], subject, html, text }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      await logErr("welcome-send-failed", new Error(data?.message ?? `HTTP ${r.status}`), { email, status: r.status });
      return json({ error: data?.message ?? "send failed", status: r.status }, 502);
    }
    return json({ success: true, id: data?.id }, 200);
  } catch (err) {
    await logErr("welcome-fn-error", err, { url: req.url });
    return json({ error: "Internal error" }, 500);
  }
});
