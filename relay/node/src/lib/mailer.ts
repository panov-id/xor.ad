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

// Article 16(4) DSA: a notice gets a confirmation of receipt without undue delay,
// whenever the notifier left an address. Deliberately plain — it confirms, states
// what happens next, and promises no deadline the operator cannot hold.
export async function sendNoticeReceipt(
  to: string,
  opts: { id: string | null; brand?: string; lang?: string },
): Promise<void> {
  if (config.mail.transport === "none") return;
  const brand = (opts.brand && brandByKey(opts.brand)) || resolveBrand(null);
  const reference = opts.id ? opts.id.slice(0, 8) : "—";
  const subject = `${brand.name}: your report has been received`;
  const lines = [
    "We received your report and it is on the queue.",
    "",
    `Reference: ${reference}`,
    "",
    "A person will look at it — not an automated system — and you will be told",
    "what was decided and why, together with how to contest that decision.",
    "",
    "If the content had already disappeared before your report arrived, we will",
    "say so plainly rather than pretend to have examined it.",
  ];
  const body = lines.join("\n");
  const html = `<p>${lines.map((line) => line || "&nbsp;").join("<br>")}</p>`;
  try {
    if (config.mail.transport === "smtp") {
      await sendSmtp({
        host: config.mail.smtp.host,
        port: config.mail.smtp.port,
        from: brand.from,
        to,
        subject,
        html,
      });
    } else {
      await viaResend(config.resend.fromOverride || brand.from, to, subject, html, body, brand.key);
    }
    inc("relay_mail_total", { transport: config.mail.transport, result: "sent", kind: "notice_receipt" });
  } catch (e) {
    inc("relay_mail_total", { transport: config.mail.transport, result: "failed", kind: "notice_receipt" });
    log("error", "notice receipt failed", { error: String(e) });
  }
}

// Article 16(5): the notifier learns what was decided, why, whether a machine
// took part, and where to go if they disagree. The redress routes are named
// rather than gestured at — and the one we do not have (a formal internal appeal
// under Article 20) is not claimed.
export async function sendNoticeDecision(
  to: string,
  opts: { id: string; brand: string; decision: "upheld" | "rejected"; facts: string },
): Promise<void> {
  if (config.mail.transport === "none") return;
  const brand = brandByKey(opts.brand) || resolveBrand(null);
  const outcome = opts.decision === "upheld"
    ? "We agreed with your report, and the content has been restricted."
    : "We did not agree with your report, and the content stays.";
  const lines = [
    `Your report ${opts.id.slice(0, 8)} has been decided.`,
    "",
    outcome,
    "",
    "Why:",
    opts.facts,
    "",
    "A person took this decision. Automated systems screen what is published,",
    "but they did not decide your report.",
    "",
    "If you disagree: reply to this email and a person will look again. You may",
    "also complain to the Digital Services Coordinator of your country or of",
    "Cyprus — the Radiotelevision and Digital Services Authority, rtdsa.org.cy —",
    "or go to court. We do not operate a formal internal appeals body.",
  ];
  await deliver(brand, to, `${brand.name}: your report has been decided`, lines);
}

// Article 17: whoever's content was restricted is owed the reasons. The
// notifier's identity is never in here — that rule is stricter than the article
// allows, and it is the one the offers spec already sets for complaints.
export async function sendStatementOfReasons(
  to: string,
  opts: {
    brand: string;
    restriction: string;
    facts: string;
    groundKind: "legal" | "contractual";
    groundText: string;
  },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  if (!to.includes("@")) return false; // an identity, not an address — nothing to send to
  const brand = brandByKey(opts.brand) || resolveBrand(null);
  const lines = [
    "Something you posted has been restricted, and here is why.",
    "",
    `What was done: ${opts.restriction.replace(/_/g, " ")}.`,
    "",
    "Facts and circumstances:",
    opts.facts,
    "",
    opts.groundKind === "legal"
      ? "Legal ground:"
      : "Which rule of the Terms this breaks:",
    opts.groundText,
    "",
    "This followed a report from someone else. We do not tell you who they are.",
    "",
    "Automated systems screen what is published; this decision was taken by a",
    "person.",
    "",
    "If you disagree: reply to this email and a person will look again. You may",
    "also complain to the Digital Services Coordinator of your country or of",
    "Cyprus — the Radiotelevision and Digital Services Authority, rtdsa.org.cy —",
    "or go to court.",
  ];
  return await deliver(brand, to, `${brand.name}: why your content was restricted`, lines);
}

// One sender for both letters: same transports as everything else, and a boolean
// back so a caller that records delivery can record the truth.
async function deliver(
  brand: { key: string; name: string; from: string },
  to: string,
  subject: string,
  lines: string[],
): Promise<boolean> {
  const body = lines.join("\n");
  const html = `<p>${lines.map((line) => line || "&nbsp;").join("<br>")}</p>`;
  try {
    if (config.mail.transport === "smtp") {
      await sendSmtp({
        host: config.mail.smtp.host,
        port: config.mail.smtp.port,
        from: brand.from,
        to,
        subject,
        html,
      });
    } else {
      await viaResend(config.resend.fromOverride || brand.from, to, subject, html, body, brand.key);
    }
    inc("relay_mail_total", { transport: config.mail.transport, result: "sent", kind: "dsa" });
    return true;
  } catch (e) {
    inc("relay_mail_total", { transport: config.mail.transport, result: "failed", kind: "dsa" });
    log("error", "dsa mail failed", { error: String(e), subject });
    return false;
  }
}
