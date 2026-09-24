// Welcome email dispatch. Resolves the brand (from an explicit key or the signup
// source), builds the localized email (welcome.ts), then sends it via the
// configured transport: resend (real) or smtp (Mailpit on dev/local). Best-effort
// — a mail failure never fails the signup.

// From the registry, not from config.ts — which exports a function of the same
// name that reads the seed baked into the image. Importing that one meant a
// brand edited through the panel kept sending letters under its old identity:
// the registry was the door onboarding writes through, and the letters were not
// reading it. Found when a rename landed in the database and the mail ignored it.
import { config } from "../config.ts";
import { brandByKey } from "./brand_registry.ts";
import { SNAPSHOTTABLE } from "./dsa_snapshot.ts";
import { resolveBrand, welcomeEmail } from "./welcome.ts";
import { type Block, letter, PLATFORM } from "./email_shell.ts";
import { sendSmtp } from "./smtp.ts";
import { inc } from "./metrics.ts";
import { log } from "./log.ts";

// What a rejected send is allowed to say in a log line.
//
// The whole provider body used to go in, five hundred characters of it, at
// error level — and error lines are copied to storage and kept for thirty days
// (tools/prune_objects.ts, "server-logs"). Resend quotes the request back when
// it complains: `Invalid \`to\` field` arrives with the address in it, so one
// mistyped recipient put somebody's email address in a month-long log, and a
// provider outage put every recipient of the retry storm there.
//
// The machine-readable `name` is what a reader actually acts on — a
// `validation_error` and a `rate_limit_exceeded` need different things done —
// and it carries no addresses, because it is a code from a fixed list.
async function providerFault(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const name = (body as { name?: unknown })?.name;
    return typeof name === "string" ? name : "unnamed";
  } catch {
    // Not JSON at all: a gateway's HTML error page, or nothing. Neither is worth
    // quoting, and both are described well enough by the status beside this.
    return "unreadable";
  }
}

// Anything built from an exception may still have travelled through a message
// somebody else wrote. Addresses are the one thing that must not survive into a
// stored log line, so they are removed by shape rather than by trust.
export function withoutAddresses(text: string): string {
  return text.replace(/[\w.+-]+@[\w.-]+\.\w+/g, "<address>");
}

const RESEND_TIMEOUT_MS = 20_000;

async function viaResend(
  from: string, to: string, subject: string, html: string, text: string, brandKey: string,
) {
  // Send from the brand's own Resend account (its domain is verified there);
  // fall back to the default key for brands without a dedicated account.
  const key = config.resend.keysByBrand[brandKey] || config.resend.key;
  // Both refusals throw. They used to log and return, and every caller counted
  // the letter as sent: a missing key or a 401 read as delivered, and the DSA
  // watchdog believed it had warned someone (review panel, 23.09.2026). Both
  // callers catch, so a refusal is a "failed" count, never a 500.
  if (!key) throw new Error(`no Resend key for brand ${brandKey}`);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
    // A provider that hangs is a failure, not a wait: the watchdogs retry a
    // failure, and nothing retries a request that never returns.
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    log("error", "resend rejected a letter", {
      transport: "resend",
      status: res.status,
      brand: brandKey,
      fault: await providerFault(res),
    });
    throw new Error(`Resend refused the letter: ${res.status}`);
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
    throw new Error(`panel mail rejected: ${res.status} ${await providerFault(res)}`);
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
      error: withoutAddresses(String(error)),
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
  const brand = (opts.brand ? await brandByKey(opts.brand) : undefined) ??
    resolveBrand(opts.source ?? null);
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
    log("error", "welcome mail failed", { error: withoutAddresses(String(e)) });
  }
}

// Article 16(4) DSA: a notice gets a confirmation of receipt without undue delay,
// whenever the notifier left an address. Deliberately plain — it confirms, states
// what happens next, and promises no deadline the operator cannot hold.
// Returns whether a letter actually left. The caller records the Article 16(4)
// acknowledgement from this and from nothing else: a node configured without
// mail returns early here, and calling that "acknowledged" would be the same
// kind of untruth the flag used to carry when it meant "an address was given".
export async function sendNoticeReceipt(
  to: string,
  opts: { id: string | null; brand?: string; lang?: string },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = (opts.brand ? await brandByKey(opts.brand) : undefined) ?? resolveBrand(null);
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
  return sent;
}

// A notice that nobody is told about waits for somebody to open a page.
//
// Intake sent a receipt to the notifier and nothing to us: the queue exists, and
// a moderator finds a report there only by looking. Meanwhile both storefronts
// promise in public that we examine reports and say what we decided, and the
// specification sets 72 hours for it. A queue read by chance does not keep a
// promise with a clock on it — found by a review panel 2026-09-08.
//
// What the letter carries is deliberately thin: the reference, what kind of
// thing it is about, and which queue it landed in. Not the reason text, not the
// notifier's name or address. Mail is the least private hop in the system, the
// letter goes to a shared inbox, and everything useful for examining the report
// is in the panel behind a login.
export function noticeArrivedBlocks(opts: {
  id: string | null;
  kind: string;
  queue: "platform" | "tenant";
  receivedVia?: string | null;
}): Block[] {
  const reference = opts.id ? opts.id.slice(0, 8) : "—";
  const where = opts.queue === "platform"
    ? "It is in the platform queue" +
      (opts.receivedVia ? ` (filed through ${opts.receivedVia})` : "")
    : "It is in your queue";
  return [
    { kind: "text", value: "A report of illegal content has arrived." },
    { kind: "reference", value: `Reference: ${reference}` },
    { kind: "text", value: `About: ${opts.kind.replace(/_/g, " ")}. ${where}.` },
    {
      kind: "text",
      value: "Article 16 gives it a clock: the specification sets 72 hours to examine it " +
        "and answer. Open the Illegal-content reports page in the panel — the report " +
        "itself, and whatever copy we hold, are there rather than in this letter.",
    },
  ];
}

// The team's daily digest of support requests (chat spec §13): numbers only.
// No request's text, no email, no number of a request — a letter per request
// would turn the mailbox into a copy of a table that lives a year, and a
// digest that quoted them would be the same copy once a day.
export function supportDigestBlocks(
  line: { new: number; waiting: number; frozen: number; tombstones?: { kind: string; count: number }[] },
): Block[] {
  const gaveUp = line.tombstones && line.tombstones.length > 0
    ? [{
      kind: "text" as const,
      value: "Jobs that gave up after their attempts: " +
        line.tombstones.map((t) => `${t.kind} ×${t.count}`).join(", ") +
        ". The node re-arms them within the hour; one that keeps giving up needs a look at the node log.",
    }]
    : [];
  return [
    { kind: "text", value: "Support requests, the last day." },
    { kind: "text", value: `New: ${line.new}. Waiting for an answer: ${line.waiting}.` },
    {
      kind: "text",
      value: `Written from a session frozen by the PIN limit: ${line.frozen}. ` +
        "Read these first — a frozen session may be the owner locked out of a taken identity.",
    },
    // The door exists since 2026-09-22 (GET /admin/support, the Support page);
    // a test holds the letter to it.
    { kind: "text", value: "The requests themselves are not in this letter: read and answer them on the Support page of the panel." },
    ...gaveUp,
  ];
}

export async function sendSupportDigest(
  to: string,
  brandKey: string,
  line: { new: number; waiting: number; frozen: number; tombstones?: { kind: string; count: number }[] },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = (await brandByKey(brandKey)) ?? resolveBrand(null);
  return await deliver(
    brand,
    to,
    `${brand.name}: support requests, the last day`,
    "Support digest",
    supportDigestBlocks(line),
  );
}

// Best-effort, like the receipt: a mail failure must not lose a notice that is
// already stored. What it must not do is fail silently, so the caller logs.
export async function sendNoticeArrived(
  to: string,
  opts: { id: string | null; kind: string; queue: "platform" | "tenant"; receivedVia?: string | null; brand?: string },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = (opts.brand ? await brandByKey(opts.brand) : undefined) ?? resolveBrand(null);
  return await deliver(
    brand,
    to,
    `${brand.name}: a report of illegal content is waiting`,
    "A report is waiting",
    noticeArrivedBlocks(opts),
  );
}

// Article 16(5): the notifier learns what was decided, why, whether a machine
// took part, and where to go if they disagree. The redress routes are named
// rather than gestured at — and the one we do not have (a formal internal appeal
// under Article 20) is not claimed.
// The specification names four outcomes for this letter: removed, kept, the
// content was already gone, unreachable. Two follow from the decision; the other
// two are facts about the content that hold whichever way the decision went, so
// they are said first.
//
// It had two sentences for the four, so a report about a phrase that had already
// expired came back as "we did not agree with your report" — which is not what
// happened, and is the exact untruth the snapshot states were introduced to keep
// out of the file.
//
// Its own function so it can be read and tested without sending anything.
export function decisionOutcome(
  decision: "upheld" | "rejected",
  snapshotState?: string,
  snapshotReason?: string,
): string {
  if (snapshotState === "target_gone") {
    return "The content was already gone by the time we looked, so there was nothing " +
      "left to restrict. Your report was still examined and recorded.";
  }
  // Not every "we could not look" is "we do not hold it". When the target lives
  // under another storefront the phrase is ours and alive, and the sentence
  // below would be false — the same kind of falsehood db/014 was written to stop,
  // reappearing one file over. The other face is never named: what the notifier
  // learns is where we looked, not where it is.
  if (snapshotState === "not_accessible" && snapshotReason === "out_of_scope") {
    return "We did not find it under the storefront your report came through, so we " +
      "could not examine a copy. Your report was recorded and examined all the same.";
  }
  if (snapshotState === "not_accessible") {
    return "We could not reach the content to examine it — it is not something we " +
      "hold. Your report was still recorded, and what we could check, we did.";
  }
  return decision === "upheld"
    ? "We agreed with your report, and the content has been restricted."
    : "We did not agree with your report, and the content stays.";
}

// Watchdog С1: a notice nobody has answered, at 24 hours and again at 48.
// It carries a reference and an age — no reason text, no notifier — because it
// goes to a shared inbox first and to personal addresses second.
export function noticeAgingBlocks(
  notice: { id: string; kind: string; age_hours: number; stage: "remind" | "escalate" },
): Block[] {
  // Not "the second letter": a notice first seen past 48 hours — a backlog on
  // the first rollout, a node that was down — skips the reminder.
  const urgency = notice.stage === "escalate"
    ? "It has been waiting two days, and it now goes to the people named for this."
    : "It has been waiting a day.";
  return [
    {
      kind: "text",
      value: `A report of illegal content is still unanswered after ${notice.age_hours} hours. ${urgency}`,
    },
    { kind: "text", value: `Reference: ${notice.id.slice(0, 8)}. Target: ${notice.kind}.` },
    {
      kind: "text",
      value: "Article 16(6) asks for a timely decision. Open the notice in the panel and take it.",
    },
  ];
}

export async function sendNoticeAging(
  to: string,
  notice: { id: string; kind: string; brand?: string | null; age_hours: number; stage: "remind" | "escalate" },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = (notice.brand ? await brandByKey(notice.brand) : undefined) ?? resolveBrand(null);
  const subject = notice.stage === "escalate"
    ? `${brand.name}: a report has been unanswered for two days`
    : `${brand.name}: a report has been unanswered for a day`;
  return await deliver(brand, to, subject, subject, noticeAgingBlocks(notice));
}

// Watchdog С1 past its ceiling: the notices beyond the first few of a pass, in
// one letter. Each by its reference, kind, age and stage — never the text.
export function noticeAgingSummaryBlocks(
  notices: { id: string; kind: string; brand?: string | null; age_hours: number; stage: "remind" | "escalate" }[],
): Block[] {
  return [
    {
      kind: "text",
      value: `${notices.length} more reports of illegal content are still unanswered, beyond the ones ` +
        "sent one by one in this pass.",
    },
    ...notices.map((n): Block => ({
      kind: "text",
      value: `Reference: ${n.id.slice(0, 8)}. Face: ${n.brand ?? "platform"}. Target: ${n.kind}. Waiting ${n.age_hours} hours` +
        (n.stage === "escalate" ? ", escalated." : "."),
    })),
    { kind: "text", value: "Article 16(6) asks for a timely decision. Open them in the panel." },
  ];
}

export async function sendNoticeAgingSummary(
  to: string,
  notices: { id: string; kind: string; brand?: string | null; age_hours: number; stage: "remind" | "escalate" }[],
): Promise<boolean> {
  if (config.mail.transport === "none" || notices.length === 0) return false;
  // One face's name only when every notice in it came through that face; an
  // escalation mixes them, and it went out under the first one's brand with the
  // others unnamed (verifier, 2026-09-24).
  const faces = new Set(notices.map((n) => n.brand ?? null));
  const only = faces.size === 1 ? notices[0].brand : null;
  const brand = (only ? await brandByKey(only) : undefined) ?? resolveBrand(null);
  const subject = `${brand.name}: ${notices.length} more reports are unanswered`;
  return await deliver(brand, to, subject, subject, noticeAgingSummaryBlocks(notices));
}

// Watchdog С3: a job whose period the privacy policy promises ran out of
// attempts. The job and the row, never its error text — that goes to the log,
// where withoutAddresses has already been over it.
export function jobTombstoneBlocks(tombstone: { id: string; kind: string; attempts: number }): Block[] {
  return [
    {
      kind: "text",
      value: `The scheduled job ${tombstone.kind} gave up after ${tombstone.attempts} attempts. ` +
        "What it deletes is kept past the period the privacy policy promises until it runs again.",
    },
    {
      kind: "text",
      value: `Job row: ${tombstone.id}. The node re-arms it within the hour, and it runs at its next ` +
        "turn — up to a day later. If it gives up again, another letter follows. The error is in the node log.",
    },
  ];
}

// Watchdog С7: the last nightly dump is older than it should be, or none has
// been seen since the node started (lib/backup_watch.ts). No data of anyone's.
export function backupStaleBlocks(env: string, ageHours: number | null): Block[] {
  return [
    {
      kind: "text",
      value: ageHours === null
        ? `No nightly backup of ${env} has been seen since this node started.`
        : `The last nightly backup of ${env} went up ${ageHours} hours ago.`,
    },
    {
      kind: "text",
      value: "Look at relay-backup.service on the box (journalctl -u relay-backup.service) and at the " +
        "storage zone. Another letter follows in a day if it stays this way.",
    },
  ];
}

export async function sendBackupStale(to: string, ageHours: number | null): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = resolveBrand(null);
  const subject = `${brand.name}: the ${config.envName} backup is late`;
  return await deliver(brand, to, subject, subject, backupStaleBlocks(config.envName, ageHours));
}

export async function sendJobTombstone(
  to: string,
  tombstone: { id: string; kind: string; attempts: number },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = resolveBrand(null);
  const subject = `${brand.name}: the job ${tombstone.kind} gave up`;
  return await deliver(brand, to, subject, subject, jobTombstoneBlocks(tombstone));
}

// Watchdog С2's end: the letter about a new report never reached the support
// inbox. A reference and a count — nothing of the report itself.
export function arrivalUnsentBlocks(notice: { id: string; kind: string; attempts: number }): Block[] {
  return [
    {
      kind: "text",
      value: `A report of illegal content arrived and the letter to the support inbox failed ` +
        `${notice.attempts} times. Nobody may know it is waiting.`,
    },
    { kind: "text", value: `Reference: ${notice.id.slice(0, 8)}. Target: ${notice.kind}. Open the notice in the panel and take it.` },
  ];
}

export async function sendArrivalUnsent(
  to: string,
  notice: { id: string; kind: string; attempts: number },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = resolveBrand(null);
  const subject = `${brand.name}: nobody was told about a report of illegal content`;
  return await deliver(brand, to, subject, subject, arrivalUnsentBlocks(notice));
}

// The night path's ceiling: what an hour held back beyond the letters sent one
// by one. A count and a pointer — no notice, no reference.
export function nightPathSummaryBlocks(summary: { hour: Date; held: number; shown: number }): Block[] {
  const from = summary.hour.toISOString().slice(0, 13).replace("T", " ") + ":00 UTC";
  return [
    {
      kind: "text",
      value: `In the hour from ${from}, ${summary.held} more reports of illegal content arrived ` +
        `beyond the first ${summary.shown} of that hour.`,
    },
    { kind: "text", value: "Open the DSA queue in the panel to see them." },
  ];
}

export async function sendNightPathSummary(
  to: string,
  summary: { hour: Date; held: number; shown: number },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  const brand = resolveBrand(null);
  const subject = `${brand.name}: ${summary.held} more reports of illegal content in one hour`;
  return await deliver(brand, to, subject, subject, nightPathSummaryBlocks(summary));
}

export async function sendNoticeDecision(
  to: string,
  // Nullable: a notice can arrive naming no storefront (migration 007), and the
  // letter still has to go out. Falls back to the default face below, which is
  // what the receipt for that same notice already did.
  opts: {
    id: string;
    brand: string | null;
    decision: "upheld" | "rejected";
    facts: string;
    // What we found when we went to look. Without it this letter had two
    // sentences for four outcomes, so a report about a phrase that had already
    // expired came back as "we did not agree with your report" — which is not
    // what happened, and is the exact untruth dsa_snapshot.ts was written to
    // avoid filing.
    snapshotState?: string;
    snapshotReason?: string;
  },
): Promise<void> {
  if (config.mail.transport === "none") return;
  const brand = (opts.brand ? await brandByKey(opts.brand) : null) ?? resolveBrand(null);
  const outcome = decisionOutcome(opts.decision, opts.snapshotState, opts.snapshotReason);
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
  // Optional the same way the reason itself is: most outcomes do not have one,
  // and the callers that predate the column keep working unchanged.
  snapshotReason?: string,
): Block[] {
  // Which columns hold the content is a property of the surface, and the surface
  // is what `targetKind` names — so it is looked up rather than guessed. It used
  // to be guessed: whichever of `text` or `offer_text` happened to be present
  // won, the argument was ignored entirely, and the two tests that were supposed
  // to tell a phrase from an offer differed only by that ignored argument.
  const surface = targetKind ? SNAPSHOTTABLE[targetKind] : undefined;
  const row = (snapshot as { row?: Record<string, unknown> } | null)?.row;
  const value = (column: string | undefined) =>
    column && typeof row?.[column] === "string" ? row[column] as string : null;
  const quote = value(surface?.quote);
  const stamp = value(surface?.posted);
  const posted = stamp ? stamp.slice(0, 16).replace("T", " ") : null;

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
  if (snapshotState === "not_accessible" && snapshotReason === "out_of_scope") {
    return [{
      kind: "text",
      value: "We did not find it under the storefront the report came through, so there is no copy to show.",
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
    // Nullable for the same reason as the decision letter above.
    brand: string | null;
    restriction: string;
    facts: string;
    groundKind: "legal" | "contractual";
    groundText: string;
    targetKind?: string;
    snapshot?: unknown;
    snapshotState?: string;
    snapshotReason?: string;
  },
): Promise<boolean> {
  if (config.mail.transport === "none") return false;
  if (!to.includes("@")) return false; // an identity, not an address — nothing to send to
  const brand = (opts.brand ? await brandByKey(opts.brand) : null) ?? resolveBrand(null);
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
    ...whatWasRestricted(opts.targetKind, opts.snapshot, opts.snapshotState, opts.snapshotReason),
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
    log("error", "dsa mail failed", { error: withoutAddresses(String(e)), subject });
    return false;
  }
}
