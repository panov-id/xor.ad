// Welcome email dispatch. Resolves the brand (from an explicit key or the signup
// source), builds the localized email (welcome.ts), then sends it via the
// configured transport: resend (real) or smtp (Mailpit on dev/local). Best-effort
// — a mail failure never fails the signup.

import { brandByKey, config } from "../config.ts";
import { resolveBrand, welcomeEmail } from "./welcome.ts";
import { sendSmtp } from "./smtp.ts";
import { inc } from "./metrics.ts";
import { log } from "./log.ts";

async function viaResend(
  from: string, to: string, subject: string, html: string, text: string, brandKey: string,
) {
  // Send from the brand's own Resend account (its domain is verified there);
  // fall back to the default key for brands without a dedicated account.
  const key = config.resend.keysByBrand[brandKey] || config.resend.key;
  if (!key) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) console.error(`[resend] ${res.status} ${await res.text()}`);
}

// Panel sign-in link — a system email (not brand), sent from the panel sender
// via the default Resend account (panov.id) or Mailpit on dev/local.
export async function sendPanelLink(to: string, link: string): Promise<void> {
  const subject = "Your xor panel sign-in link";
  const html = `<p>Sign in to the panel:</p><p><a href="${link}">${link}</a></p>` +
    `<p>This link expires in 15 minutes and can be used once.</p>`;
  const text = `Sign in: ${link}\n(expires in 15 minutes, one-time)`;
  if (config.mail.transport === "smtp") {
    await sendSmtp({
      host: config.mail.smtp.host,
      port: config.mail.smtp.port,
      from: config.panel.sender,
      to,
      subject,
      html,
    });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.resend.key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: config.panel.sender, to: [to], subject, html, text }),
  });
  if (!res.ok) console.error(`[panel-mail] ${res.status} ${await res.text()}`);
}

export async function sendWelcome(
  to: string,
  opts: { lang?: string; accent?: string; mode?: string; source?: string | null; brand?: string },
): Promise<void> {
  if (config.mail.transport === "none") return;
  const brand = (opts.brand && brandByKey(opts.brand)) || resolveBrand(opts.source ?? null);
  const { subject, from, html, text } = welcomeEmail(opts.lang, {
    accent: opts.accent,
    mode: opts.mode,
    brand,
  });
  try {
    if (config.mail.transport === "smtp") {
      await sendSmtp({ host: config.mail.smtp.host, port: config.mail.smtp.port, from, to, subject, html });
    } else {
      await viaResend(config.resend.fromOverride || from, to, subject, html, text, brand.key);
    }
    inc("relay_mail_total", { transport: config.mail.transport, result: "sent" });
  } catch (e) {
    inc("relay_mail_total", { transport: config.mail.transport, result: "failed" });
    log("error", "welcome mail failed", { error: String(e) });
  }
}
