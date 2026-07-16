// Welcome email via Resend. Best-effort: a failure here never fails the signup.
// The node serves both faces, so the sender + branding are resolved from the
// signup's source (sosed | neighbro). Templates live in welcome.ts.

import { config } from "../config.ts";
import { welcomeEmail } from "./welcome.ts";

function faceFrom(source: string | null): "sosed" | "neighbro" {
  return (source ?? "").toLowerCase().includes("neighbro") ? "neighbro" : "sosed";
}

export async function sendWelcome(
  to: string,
  opts: { lang?: string; accent?: string; mode?: string; source?: string | null },
): Promise<void> {
  if (!config.resend.key) return;
  const { subject, from, html, text } = welcomeEmail(opts.lang, {
    accent: opts.accent,
    mode: opts.mode,
    face: faceFrom(opts.source ?? null),
  });
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resend.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: config.resend.fromOverride || from, // face sender unless a global override is set
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) console.error(`[resend] ${res.status} ${await res.text()}`);
}
