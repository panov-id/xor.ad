// Welcome email dispatch. Resolves the brand (from an explicit key or the signup
// source), builds the localized email (welcome.ts), then sends it via the
// configured transport: resend (real) or smtp (Mailpit on dev/local). Best-effort
// — a mail failure never fails the signup.

import { brandByKey, config } from "../config.ts";
import { resolveBrand, welcomeEmail } from "./welcome.ts";
import { type Block, letter, PLATFORM } from "./email_shell.ts";
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
  // The panel belongs to the platform rather than to a storefront, so it wears
  // the primary brand's face — the same one its own header shows.
  const { html, text } = letter({
    // The panel's own identity, not the first storefront in the registry — which
    // is what this reached for, and it sent a sign-in link dressed as СОСЕД
    // pointing at xor.panov.id. On a letter that hands over access, a face
    // borrowed from somebody else teaches the reader that the face means nothing.
    brand: PLATFORM,
    title: "Sign in to the panel",
    blocks: [
      { kind: "text", value: "Open this link to sign in:" },
      { kind: "reference", value: link },
      { kind: "text", value: "It expires in 15 minutes and can be used once." },
    ],
    footnote: "You are receiving this because someone asked to sign in with this address.",
  });
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
  const { html, text } = letter({
    brand: PLATFORM,
    title: `You have been invited to ${scope}`,
    blocks: [
      { kind: "text", value: `You have been given access to ${scope}.` },
      { kind: "reference", value: link },
      {
        kind: "text",
        value: "This link expires in 7 days and can be used once. After that, ask for a " +
          "new one from the panel's sign-in page.",
      },
    ],
    footnote: "You are receiving this because an administrator gave you access.",
  });
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
  const blocks: Block[] = [
    { kind: "text", value: "We received your report and it is on the queue." },
    { kind: "reference", value: `Reference: ${reference}` },
    {
      kind: "text",
      value: "A person will look at it — not an automated system — and you will be told " +
        "what was decided and why, together with how to contest that decision.",
    },
    {
      kind: "text",
      value: "If the content had already disappeared before your report arrived, we will " +
        "say so plainly rather than pretend to have examined it.",
    },
  ];
  // The same sender as every other letter about a notice: one path, one shell,
  // and the counter keeps its own kind so a failing receipt stays visible.
  const sent = await deliver(
    brand,
    to,
    subject,
    "Your report has been received",
    blocks,
    "You are receiving this because you reported content to us.",
  );
  inc("relay_mail_total", {
    transport: config.mail.transport,
    result: sent ? "sent" : "failed",
    kind: "notice_receipt",
  });
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
  const blocks: Block[] = [
    { kind: "reference", value: `Report ${opts.id.slice(0, 8)}` },
    { kind: "text", value: outcome },
    { kind: "heading", value: "Why" },
    { kind: "quote", value: opts.facts },
    {
      kind: "text",
      value: "A person took this decision. Automated systems screen what is published, " +
        "but they did not decide your report.",
    },
    { kind: "heading", value: "If you disagree" },
    {
      kind: "text",
      value: "Reply to this email and a person will look again. You may also complain to " +
        "the Digital Services Coordinator of your country or of Cyprus — the " +
        "Radiotelevision and Digital Services Authority, rtdsa.org.cy — or go to court. " +
        "We do not operate a formal internal appeals body.",
    },
  ];
  await deliver(
    brand,
    to,
    `${brand.name}: your report has been decided`,
    "Your report has been decided",
    blocks,
    "You are receiving this because you reported content to us.",
  );
}

// Article 17: whoever's content was restricted is owed the reasons. The
// notifier's identity is never in here — that rule is stricter than the article
// allows, and it is the one the offers spec already sets for complaints.
// Which of the author's posts this is about, in their own words. The snapshot
// was taken when the notice arrived precisely so this sentence can exist after
// the content itself has expired; leaving it out made the letter open with
// "something you posted" and never say which.
export function whatWasRestricted(
  targetKind: string | undefined,
  snapshot: unknown,
  snapshotState: string | undefined,
): Block[] {
  const row = (snapshot as { row?: Record<string, unknown> } | null)?.row;
  const quote = typeof row?.body === "string"
    ? row.body
    : typeof row?.offer_text === "string"
    ? row.offer_text
    : null;
  const posted = typeof row?.created_at === "string" ? row.created_at.slice(0, 16).replace("T", " ") : null;

  if (quote) {
    return [
      { kind: "heading", value: posted ? `What it was, posted ${posted}` : "What it was" },
      { kind: "quote", value: quote },
    ];
  }
  // No copy — and the three reasons are not interchangeable. Telling somebody
  // "it had expired" when nobody ever looked would be a lie in the one letter
  // that must not contain any.
  if (snapshotState === "target_gone") {
    return [{
      kind: "text",
      value: "It had already expired by the time the report was examined, so there is no copy to show you.",
    }];
  }
  if (snapshotState === "not_accessible") {
    return [{
      kind: "text",
      value: "We hold no copy of it: this kind of content is not stored where we could take one.",
    }];
  }
  return [];
}

export async function sendStatementOfReasons(
  to: string,
  opts: {
    brand: string;
    restriction: string;
    facts: string;
    groundKind: "legal" | "contractual";
    groundText: string;
    targetKind?: string;
    snapshot?: unknown;
    snapshotState?: string;
  },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  if (!to.includes("@")) return false; // an identity, not an address — nothing to send to
  const brand = brandByKey(opts.brand) || resolveBrand(null);
  const blocks: Block[] = [
    { kind: "text", value: `What was done: ${opts.restriction.replace(/_/g, " ")}.` },
    // Article 17(3)(a) asks for territorial scope and duration "where relevant".
    // Ours are always both: one feed, no regional moderation, and nothing lifts a
    // restriction later. Stated rather than left to be assumed — and it becomes a
    // field on the form the day either can differ.
    {
      kind: "text",
      value: "It applies everywhere the Service is available, and it is not time-limited.",
    },
    ...whatWasRestricted(opts.targetKind, opts.snapshot, opts.snapshotState),
    { kind: "heading", value: "Facts and circumstances" },
    { kind: "quote", value: opts.facts },
    {
      kind: "heading",
      value: opts.groundKind === "legal" ? "Legal ground" : "Which rule of the Terms this breaks",
    },
    { kind: "quote", value: opts.groundText },
    {
      kind: "text",
      value: "This followed a report from someone else. We do not tell you who they are.",
    },
    {
      kind: "text",
      value: "Automated systems screen what is published; this decision was taken by a person.",
    },
    { kind: "heading", value: "If you disagree" },
    // Word for word what the notifier is told. Two descriptions of one fact read
    // as two different procedures, and the author's version, lacking the last
    // sentence, promised a formal appeal that does not exist.
    {
      kind: "text",
      value: "Reply to this email and a person will look again. You may also complain to " +
        "the Digital Services Coordinator of your country or of Cyprus — the " +
        "Radiotelevision and Digital Services Authority, rtdsa.org.cy — or go to court. " +
        "We do not operate a formal internal appeals body.",
    },
  ];
  return await deliver(
    brand,
    to,
    `${brand.name}: why your content was restricted`,
    "Something you posted has been restricted",
    blocks,
    "You are receiving this because a decision was taken about content you posted.",
  );
}

// One sender for both letters: same transports as everything else, and a boolean
// back so a caller that records delivery can record the truth.
async function deliver(
  brand: { key: string; name: string; from: string; domain: string; upper: string },
  to: string,
  subject: string,
  title: string,
  blocks: Block[],
  footnote?: string,
): Promise<boolean> {
  // Was `<p>line<br>line</p>`: the content arrived intact and looked like a
  // pasted note. The shell gives it the face the letter is written on behalf of,
  // and builds the plain-text part from the same blocks so the two cannot drift.
  const { html, text: body } = letter({ brand: brand as never, title, blocks, footnote });
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
