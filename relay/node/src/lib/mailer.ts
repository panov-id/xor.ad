// Welcome email dispatch. Builds the localized, face-aware email (welcome.ts)
// then sends it via the configured transport: resend (real) or smtp (Mailpit on
// dev/local). Best-effort — a mail failure never fails the signup.

import { config } from "../config.ts";
import { welcomeEmail } from "./welcome.ts";
import { sendSmtp } from "./smtp.ts";

function faceFrom(source: string | null): "sosed" | "neighbro" {
  return (source ?? "").toLowerCase().includes("neighbro") ? "neighbro" : "sosed";
}

async function viaResend(from: string, to: string, subject: string, html: string, text: string) {
  if (!config.resend.key) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resend.key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) console.error(`[resend] ${res.status} ${await res.text()}`);
}

export async function sendWelcome(
  to: string,
  opts: { lang?: string; accent?: string; mode?: string; source?: string | null },
): Promise<void> {
  if (config.mail.transport === "none") return;
  const { subject, from, html, text } = welcomeEmail(opts.lang, {
    accent: opts.accent,
    mode: opts.mode,
    face: faceFrom(opts.source ?? null),
  });
  try {
    if (config.mail.transport === "smtp") {
      await sendSmtp({ host: config.mail.smtp.host, port: config.mail.smtp.port, from, to, subject, html });
    } else {
      await viaResend(config.resend.fromOverride || from, to, subject, html, text);
    }
  } catch (e) {
    console.error("[mail]", e);
  }
}
