// Screen 02 (panel/design/sheets/screen-02.svg): two steps.
//
//   1 · who you are: a name up to 24 graphemes, an age from 13, consent to the
//       three documents — "next" stays off without it (Н1).
//   2 · the PIN twice, then the paper code: sixteen characters in four groups,
//       shown once, and the second and fourth groups typed back before the
//       registration is confirmed (chat spec §8.2; depth/core/paper.ts reads
//       the typed groups the same way, so the two faces cannot drift).
//
// The PIN that is easy to guess warns and does not stop (§8.2, 2026-08-26).

import { type ReactNode, useEffect, useId, useState } from "react";
import { Client } from "../../../depth/core/client.ts";
import { type LegalRevision, readManifest } from "../../../depth/core/legal.ts";
import { Mark } from "../ui/Mark.tsx";
import { API_KEY, NODE_BASE } from "../config.ts";
import { acceptAndKeep, docUrl, LEGAL_ORDER } from "./Legal.tsx";
import { newPaperCode, paperGroups, readPaperText } from "../../../depth/core/paper.ts";
import { openSealed, registerAndKeep, type Record_ } from "../vault.ts";
import { dateLong, say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { Checkbox } from "../ui/Checkbox.tsx";
import { CodeField } from "../ui/CodeField.tsx";
import { CodePlate, FormCard, PinPair, StepBar } from "../ui/FormCard.tsx";
import { Field, PinField } from "../ui/Field.tsx";
import { Icon, type IconName } from "../ui/Icon.tsx";
import { Info } from "../ui/Info.tsx";
import { Link } from "../ui/Links.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Split } from "../ui/Split.tsx";
import { obviousPin } from "../pinWords.ts";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const count = (s: string) => [...graphemes.segment(s)].length;
const NAME_MAX = 24;
const AGE_MIN = 13;
// The documents' icons on step one (sheet adaptive-*-register-1: a page, a lock, people).
const DOC_ICON: Record<string, IconName> = { terms: "consent", privacy: "key", guidelines: "company" };

// What the node's refusal means to the person (П9): the address limit (429)
// says what happened and what to do; any other status says its number; a call
// that never got an answer (offline, a dropped connection) and anything else
// say that it did not work. The core's message is "registration refused: <status> …".
function refusalLine(e: unknown): string {
  const status = /registration refused: (\d{3})/.exec(e instanceof Error ? e.message : "")?.[1];
  if (status === "429") return say("web.register.limit");
  if (status) return say("web.register.refused", { status });
  return say("web.register.failed");
}

export function Register({ onDone }: { onDone: (client: Client, sealed: "ok" | "failed") => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [pressed, setPressed] = useState(0);
  useEffect(() => setPressed(0), [step]);
  const [code] = useState(() => newPaperCode());
  // The second and the fourth group, as typed.
  const [typed, setTyped] = useState<string[]>(["", ""]);
  const [second, fourth] = typed;
  const why = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ client: Client; record: Record_; share: Uint8Array } | null>(null);
  // The face's legal revisions (W13-LC): the one consent names all three
  // documents, and under it each text's link; ticked, every revision of the
  // manifest is accepted once the identity exists. None on this node (503)
  // or not reachable — the consent alone, as before.
  const [revisions, setRevisions] = useState<LegalRevision[] | null>(null);
  useEffect(() => {
    readManifest(new Client(NODE_BASE, API_KEY)).then((m) => setRevisions(m && m.length ? m : null), () => setRevisions(null));
  }, []);
  const agreed = consent;

  const ageNumber = Number(age);
  const young = age !== "" && ageNumber < AGE_MIN;
  // "Next" is unavailable (aria-disabled, never `disabled`: it keeps its focus),
  // and the first thing missing is said in words beside it, tied by
  // aria-describedby (kit_RU.md §2; П10 — age 12 had only the general hint).
  const whyNext = name.trim().length === 0 || count(name) > NAME_MAX ? say("web.register.why_name")
    : age === "" || !Number.isInteger(ageNumber) ? say("web.register.why_age")
    : young ? say("web.register.why_young")
    : !agreed ? say("web.register.why_consent")
    : null;
  const pinOk = /^\d{6}$/.test(pin) && pin === pinAgain;
  // Both full and different says so: the general «enter 6 digits» left a person with 12 digits typed wondering (round 1, 008).
  const whyPin = pinOk ? null
    : /^\d{6}$/.test(pin) && /^\d{6}$/.test(pinAgain) ? say("web.register.why_pin_differ")
    : say("web.register.why_pin");
  const whyGroups = second && fourth ? null : say("web.register.why_groups");
  const groups = paperGroups(code);

  async function register() {
    if (busy || !pinOk) return;
    setBusy(true);
    setError(null);
    try {
      const { client, record, share } = await registerAndKeep({ name: name.trim(), age: ageNumber }, { pin, paperCode: code });
      setMade({ client, record, share });
      setStep(3);
    } catch (e) {
      setError(refusalLine(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!made || busy || whyGroups) return;
    if (readPaperText(second) !== groups[1] || readPaperText(fourth) !== groups[3]) {
      setError(say("web.register.groups_mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await made.client.confirmPaperCode();
      // The consent of step one goes to the node now: an accept is signed, and
      // the node takes a signed call only once the paper code is confirmed —
      // sent right after registration it answered 401 (W13-LC e2e). A failure
      // here is not the registration's: screen 15 is the way back.
      if (revisions) await acceptAndKeep(made.client, revisions).catch(() => null);
      // The seal is a seal: the same PIN and the share the node just gave open
      // it. Shown on the feed as a line the e2e run reads.
      let sealed: "ok" | "failed" = "failed";
      try {
        await openSealed(made.record, pin, made.share);
        sealed = "ok";
      } catch { /* the line says failed */ }
      // The share has done its one job here; it does not outlive this screen
      // (verifier of W1, 2026-09-26).
      made.share.fill(0);
      setMade(null);
      onDone(made.client, sealed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const stepTitle = step === 1 ? say("web.register.who") : step === 2 ? say("reg.pin") : say("web.register.paper_title");
  const stepWords = say("web.register.step", { n: step, m: 3 });
  const ordered = revisions ? [...revisions].sort((a, b) => LEGAL_ORDER.indexOf(a.document) - LEGAL_ORDER.indexOf(b.document)) : [];
  // What stands at the foot: the reason the primary is unavailable, then the primary.
  // A press on the closed primary answers: the reason flashes in the error colour (round 1: 004 = 005, the press read as nothing).
  const foot = (reason: string | null, button: ReactNode) => (
    <div data-part="foot" onClickCapture={(e) => { if ((e.target as Element).closest('[aria-disabled="true"]')) setPressed((n) => n + 1); }}>
      {reason && <p key={pressed} id={why} className="ui-reason" data-pressed={pressed > 0 ? "yes" : undefined} role={pressed > 0 ? "alert" : undefined}>{reason}</p>}
      <Split>{button}</Split>
    </div>
  );
  const gate = (reason: string | null, pending = false) => ({
    "aria-disabled": reason || pending ? (true as const) : undefined,
    "aria-describedby": reason ? why : undefined,
  });

  return (
    <Screen
      name={`register-${step}`}
      title={stepTitle}
      header={<StepBar n={step} of={3} label={say("web.register.step", { n: step, m: 3 })} />}
    >
      {/* the brand's mark over the form from 640 (sheets adaptive-*-register-1440; adaptive.css hides it below) */}
      <Mark size={72} place="form" />
      {step === 1 && (
        <>
          {/* The sheet (adaptive-*-register-1, owner 12.10.2026, redrawn after the review the same day): name and age as
              rows with their hints, then the box with its words, the three documents as icons under it; the editions'
              dates and the documents' links wait behind the (i). */}
          <FormCard icon="name" title={stepTitle} heading sub={stepWords} info={
            <Info label={say("web.legal.title")} data-testid="register-info">
              {ordered.map((r) => (
                <p key={r.document} data-testid={`legal-edition-${r.document}`}>
                  <Link href={docUrl(r.document)} external>{say(`web.legal.${r.document}`)}</Link>: {say("web.legal.edition", { date: dateLong(r.revision_date) })}
                </p>
              ))}
              {/* «letters left» and «from 13» wait here with the editions (owner 12.10.2026, again 14.10.2026);
                  a too-young age still says so under its field */}
              <p data-testid="register-left">{say("web.register.left", { count: Math.max(0, NAME_MAX - count(name)) })}</p>
              <p data-testid="register-age-min">{say("web.register.age_min")}</p>
            </Info>
          }>
          <Field label={say("reg.name")} value={name} onChange={setName} maxLength={64} data-testid="name" />
          <Field label={say("reg.age")} kind="number" value={age} onChange={(v) => setAge(v.replace(/\D/g, "").slice(0, 3))}
            error={young ? say("web.register.age_min") : undefined} data-testid="age" />
          <div className="ui-consent-row">
            <Checkbox checked={consent} onChange={setConsent}><span className="ui-consent-words">{say("web.register.consent")}</span></Checkbox>
            {ordered.length > 0 && (
              <ul className="ui-docs" data-testid="legal-links">
                {ordered.map((r) => (
                  <li key={r.document}>
                    {/* the short word is drawn on the sheet; the full name is the link's name and its bubble (owner 12.10 evening) */}
                    <Link href={docUrl(r.document)} external data-testid={`legal-link-${r.document}`}
                      aria-label={`${say(`web.legal.${r.document}`)} ${say("web.ui.newTab")}`} data-tip={say(`web.legal.${r.document}`)}>
                      <Icon name={DOC_ICON[r.document] ?? "consent"} />
                      <span aria-hidden="true">{say(`web.legal.short.${r.document}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          </FormCard>
          {foot(whyNext, <Button type="button" kind="primary" icon="open" aria-label={say("reg.next")} data-word={say("reg.next")} {...gate(whyNext)} onClick={() => { if (!whyNext) setStep(2); }} data-testid="next" />)}
        </>
      )}
      {step === 2 && (
        <>
          <FormCard icon="key" title={stepTitle} heading sub={stepWords} error={error} info={
            <Info label={say("web.info.pin")} data-testid="register-pin-info"><p>{say("web.ui.pinName")}</p><p>{say("web.vault.pinLocked")}</p></Info>
          }>
          <PinPair>
          <PinField value={pin} onChange={setPin} data-testid="pin" />
          <PinField label={say("web.register.pin_again")} value={pinAgain} onChange={setPinAgain}
            error={pin.length === 6 && pinAgain.length === 6 && pin !== pinAgain ? say("reg.pinMismatch") : undefined} data-testid="pin-again" />
          </PinPair>
          {pin.length === 6 && obviousPin(pin) && <Notice>{say("web.register.easy_pin")}</Notice>}
          </FormCard>
          {foot(whyPin, <Button type="button" kind="primary" icon="open" aria-label={busy ? say("web.register.waiting") : say("reg.next")} aria-busy={busy}
            {...gate(whyPin, busy)} onClick={register} data-testid="register" />)}
        </>
      )}
      {step === 3 && (
        <>
          <FormCard icon="code" title={stepTitle} heading sub={stepWords} error={error} info={<Info label={say("web.info.code")} data-testid="paper-info"><p>{say("web.register.paper_text")}</p></Info>}>
          {/* What to do stays on the screen (owner 12.10.2026: stuck here when it waited behind the (i)): write the code
              down, then the two groups — the field's own label says which. */}
          <p className="ui-paper-say" data-testid="paper-say">{say("web.register.paper_text")}</p>
          <CodePlate groups={groups} data-testid="paper-code" />
          <div data-testid="paper-groups"><CodeField label={say("web.register.confirm")} groups={[2, 4]} value={typed} onChange={setTyped} /></div>
          </FormCard>
          {foot(whyGroups, <Button type="button" kind="primary" icon="check" aria-label={say("web.register.done")} aria-busy={busy}
            {...gate(whyGroups, busy)} onClick={confirm} data-testid="confirm" />)}
        </>
      )}
    </Screen>
  );
}
