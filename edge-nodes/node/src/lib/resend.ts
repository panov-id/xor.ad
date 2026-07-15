// Welcome email via Resend. Best-effort: a failure here never fails the signup.
// TODO: port the localized templates from the existing Supabase Edge Function
// `send-waitlist-welcome` (uk/be/kk/ka + the rest). For now a minimal fallback.

import { config } from "../config.ts";

function template(lang: string): { subject: string; html: string } {
  // Minimal per-language fallback until the full templates are ported.
  const t: Record<string, { subject: string; html: string }> = {
    ru: { subject: "хой! ты в списке ✦", html: "<p>Спасибо, ты в списке первых соседей 🌻</p>" },
    en: { subject: "hey! you're on the list ✦", html: "<p>Thanks — you're on the founding list 🌻</p>" },
  };
  return t[lang] ?? t.en;
}

export async function sendWelcome(to: string, lang: string): Promise<void> {
  if (!config.resend.key) return;
  const { subject, html } = template(lang);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.resend.key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: config.resend.from, to, subject, html }),
  });
  if (!res.ok) console.error(`[resend] ${res.status} ${await res.text()}`);
}
