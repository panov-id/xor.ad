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
  if (!res.ok) {
    log("error", "welcome mail rejected", {
      transport: "resend",
      status: res.status,
      brand: brandKey,
      response: (await res.text()).slice(0, 500),
    });
  }
}

// Panel mail — system email (not brand), sent from the panel sender via the
// default Resend account (panov.id) or Mailpit on dev/local. Throws when the
// send is refused; each caller decides whether that is fatal for it.
async function sendPanelMail(
  to: string, subject: string, html: string, text: string,
): Promise<void> {
  // A node configured without mail used to fall through to Resend with an empty
  // key and get a 401 for it. Saying so plainly is better: an invitation from
  // such a node is impossible, and the caller should hear that.
  if (config.mail.transport === "none") {
    throw new Error("mail transport is 'none' — this node cannot send panel mail");
  }
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
  if (!res.ok) {
    throw new Error(`panel mail rejected: ${res.status} ${(await res.text()).slice(0, 500)}`);
  }
}

export async function sendPanelLink(to: string, link: string): Promise<void> {
  const subject = "Your xor panel sign-in link";
  const html = `<p>Sign in to the panel:</p><p><a href="${link}">${link}</a></p>` +
    `<p>This link expires in 15 minutes and can be used once.</p>`;
  const text = `Sign in: ${link}\n(expires in 15 minutes, one-time)`;
  try {
    await sendPanelMail(to, subject, html, text);
  } catch (error) {
    // A sign-in request answers the same way for everyone, so a failure cannot
    // reach the caller without telling a stranger who is a member. It belongs
    // where an operator will actually look instead.
    log("error", "panel sign-in mail rejected", {
      transport: config.mail.transport,
      error: String(error),
    });
  }
}

// Invitation to the panel. Unlike a sign-in link this is not something the
// recipient asked for, so it has to say who opened the door and to what.
export async function sendPanelInvite(
  to: string, link: string, brand: string | null,
): Promise<void> {
  const scope = brand ? `the ${brand} panel` : "the xor panel";
  const subject = `You have been invited to ${scope}`;
  const html = `<p>You have been given access to ${scope}.</p>` +
    `<p><a href="${link}">${link}</a></p>` +
    `<p>This link expires in 7 days and can be used once. After that, ask for a ` +
    `new one from the panel's sign-in page.</p>`;
  const text = `You have been given access to ${scope}.\n${link}\n` +
    `(expires in 7 days, one-time; afterwards request a link from the sign-in page)`;
  // Deliberately not caught: the caller created this operator and is waiting to
  // hear whether they were actually told about it.
  await sendPanelMail(to, subject, html, text);
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
