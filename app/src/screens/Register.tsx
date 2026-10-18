// w1_register-1..3 (sosed Dusk, mobile_390_w1_register-*): the web's registration
// (web/src/screens/Register.tsx) in the new design. Three steps, as the web has them:
//   1 · who you are: a name up to 24 graphemes, an age from 13, the consent to the three documents;
//   2 · the PIN twice (an easy one warns and does not stop);
//   3 · the paper code, shown once, the second and fourth groups typed back.
// Every rule is the SDK's (depth/core/register.ts, shared with the web), the registration itself too
// (enroll.ts registerIdentity, openSealed); this file is the words, the screen and the order of calls.
// The same testids as the web's: name, age, next, pin, pin-again, register, paper-code, paper-say,
// paper-groups, confirm, steps, error, register-left, register-age-min, legal-links, legal-link-<doc>.
//
// The record is kept on this disk at once, as the web does (vault.ts registerAndKeep: IndexedDB "xor-vault", the
// reload grace armed), so a reload after step two finds an identity and asks its PIN (Unlock.tsx).
import { useEffect, useId, useRef, useState } from "react";
import { brand } from "@brand";
import { Client } from "@sdk/client.ts";
import { openSealed, type Record_ } from "@sdk/enroll.ts";
import { acceptAll, acceptedKey, documentAddress, inLegalOrder, keepAcceptedIn, type LegalRevision, readAcceptedIn, readManifest } from "@sdk/legal.ts";
import { newPaperCode, paperGroups } from "@sdk/paper.ts";
import { obviousPin } from "@sdk/pin.ts";
import {
  groupsMatch, layOutGroups, lettersLeft, NAME_MAX, ageDigits, isYoung, pinDigits, pinsDiffer, refusalOf, whyGroups, whyNext, whyPin,
} from "@sdk/register.ts";
import { API_KEY, NODE_BASE } from "../config";
import { failedLine, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { arrowRight, check, clock } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { registerAndKeep } from "../vault";
import { CODE_CELLS, Cells, CodePlate, Field, PIN_CELLS, StepHead } from "./register-parts";

const storage = (): Storage | null => { try { return localStorage; } catch { return null; } };

// What the node's refusal means to the person (the reading is the SDK's, register.ts refusalOf).
function refusalLine(e: unknown): string {
  const r = refusalOf(e);
  if (r.kind === "limit") return say("web.register.limit");
  if (r.kind === "refused") return say("web.register.refused", { status: r.status });
  return say("web.register.failed");
}

// Accept on the node and keep what went through (web screens/Legal.tsx acceptAndKeep, the same key).
async function acceptAndKeep(client: Client, revisions: LegalRevision[]): Promise<void> {
  const key = acceptedKey(brand.name, client.identityId!);
  const { accepted } = await acceptAll(client, revisions, readAcceptedIn(storage(), key));
  keepAcceptedIn(storage(), key, accepted);
}

export type Seated = { client: Client; sealed: "ok" | "failed" | "unlocked" | "unlocked-new-wrap" };

export function Register({ onDone }: { onDone: (seated: Seated) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [pressed, setPressed] = useState(0);
  useEffect(() => setPressed(0), [step]);
  const [code] = useState(() => newPaperCode());
  const [typed, setTyped] = useState<string[]>(["", ""]);
  const [second, fourth] = typed;
  const why = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ client: Client; record: Record_; share: Uint8Array } | null>(null);
  // The face's legal revisions: the one consent names all three documents, each with its link; ticked,
  // every revision is accepted once the paper code is confirmed. None on this node (503) or not
  // reachable: the consent alone.
  const [revisions, setRevisions] = useState<LegalRevision[] | null>(null);
  useEffect(() => {
    readManifest(new Client(NODE_BASE, API_KEY)).then((m) => setRevisions(m && m.length ? m : null), () => setRevisions(null));
  }, []);

  const groups = paperGroups(code);
  const young = isYoung(age);
  const nextWhy = whyNext({ name, age, consent });
  const reasonNext = nextWhy ? say(`web.register.why_${nextWhy}`) : null;
  const pinWhy = whyPin(pin, pinAgain);
  const reasonPin = pinWhy ? say(`web.register.why_${pinWhy}`) : null;
  const reasonGroups = whyGroups(second, fourth, true) ? say("web.register.why_groups") : null;

  async function register() {
    if (busy || pinWhy) return;
    setBusy(true);
    setError(null);
    try {
      setMade(await registerAndKeep({ name: name.trim(), age: Number(age) }, { pin, paperCode: code }));
      setStep(3);
    } catch (e) {
      setError(refusalLine(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!made || busy || reasonGroups) return;
    if (!groupsMatch(groups, second, fourth)) { setError(say("web.register.groups_mismatch")); return; }
    setBusy(true);
    setError(null);
    try {
      await made.client.confirmPaperCode();
      // The consent of step one goes to the node now: a signed accept is taken only once the paper code is
      // confirmed. A failure here is not the registration's (the web's screen 15 is the way back).
      if (revisions) await acceptAndKeep(made.client, revisions).catch(() => null);
      // The seal is a seal: the same PIN and the share the node just gave open it.
      let sealed: "ok" | "failed" = "failed";
      try { await openSealed(made.record, pin, made.share); sealed = "ok"; } catch { /* the line says failed */ }
      // The share has done its one job here; it does not outlive this screen.
      made.share.fill(0);
      setMade(null);
      onDone({ client: made.client, sealed });
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }

  const title = step === 1 ? say("web.register.who") : step === 2 ? say("app.reg.pin_title") : say("app.reg.paper_title");
  const sub = step === 1 ? say("app.reg.sub1") : step === 2 ? say("app.reg.pin_sub") : say("app.reg.paper_sub");
  const ordered = revisions ? inLegalOrder(revisions) : [];

  // The foot: the reason the primary is shut (read by a screen reader at once, drawn after a press on the
  // closed primary: the sheets show none), then the primary. `aria-disabled`, never `disabled`: it keeps its focus.
  const foot = (reason: string | null, pending: boolean, button: { testid: string; word: string; icon: string; onClick: () => void }) => (
    <div className="reg-foot" onClickCapture={(e) => { if ((e.target as Element).closest('[aria-disabled="true"]')) setPressed((n) => n + 1); }}>
      {reason && <p key={pressed} id={why} className={pressed > 0 ? "reg-reason" : "reg-reason sr-only"} data-pressed={pressed > 0 ? "yes" : undefined} role={pressed > 0 ? "alert" : undefined}>{reason}</p>}
      <button type="button" className="cta cta-primary" aria-disabled={reason || pending ? true : undefined} aria-describedby={reason ? why : undefined}
        aria-busy={pending || undefined} onClick={button.onClick} data-testid={button.testid}>
        <Icon d={button.icon} /><span>{pending ? say("web.register.waiting") : button.word}</span>
      </button>
    </div>
  );

  return (
    <Screen name={`register-${step}`} title={title} className="reg">
      <StepHead n={step} of={3} />
      <div className="reg-sheet">
       <div className="reg-body" key={step}>
        <h1>{title}</h1>
        <p className="reg-sub">{sub}</p>
        {step === 1 && (
          <>
            <Field text={say("app.reg.name")} value={name} onChange={setName} maxLength={64} testid="name"
              under={<p className="reg-counter" data-testid="register-left">{say("app.reg.left", { n: lettersLeft(name), max: NAME_MAX })}</p>} />
            <Field text={say("app.reg.age")} kind="number" value={age} onChange={(v) => setAge(ageDigits(v))} testid="age" invalid={young}
              under={<p className="reg-hint" data-state={young ? "young" : undefined} data-testid="register-age-min">{say("web.register.age_min")}</p>} />
            <div className="reg-consent">
              <label className="reg-check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span className="reg-box" aria-hidden="true"><Icon d={check} /></span>
                <span>{say("web.register.consent")}</span>
              </label>
              {ordered.length > 0 && (
                <ul className="reg-docs" data-testid="legal-links">
                  {ordered.map((r) => (
                    <li key={r.document}>
                      <a href={documentAddress(brand.host, r.document)} target="_blank" rel="noopener noreferrer" data-testid={`legal-link-${r.document}`}
                        aria-label={`${say(`web.legal.${r.document}`)} ${say("web.ui.newTab")}`}>
                        <span aria-hidden="true">{say(`web.legal.short.${r.document}`)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {foot(reasonNext, false, { testid: "next", word: say("app.reg.next_pin"), icon: arrowRight, onClick: () => { if (!reasonNext) setStep(2); } })}
          </>
        )}
        {step === 2 && (
          <>
            <PinStep pin={pin} again={pinAgain} setPin={setPin} setAgain={setPinAgain} />
            {error && <div data-testid="error"><p className="reg-error" role="alert">{error}</p></div>}
            {foot(reasonPin, busy, { testid: "register", word: say("app.reg.create"), icon: arrowRight, onClick: register })}
          </>
        )}
        {step === 3 && (
          <>
            <CodePlate groups={groups} />
            <GroupsStep typed={typed} setTyped={setTyped} />
            {error && <div data-testid="error"><p className="reg-error" role="alert">{error}</p></div>}
            {foot(reasonGroups, busy, { testid: "confirm", word: label("web.register.done"), icon: check, onClick: confirm })}
          </>
        )}
       </div>
      </div>
    </Screen>
  );
}

function PinStep({ pin, again, setPin, setAgain }: { pin: string; again: string; setPin: (v: string) => void; setAgain: (v: string) => void }) {
  const first = useId(), second = useId(), differ = useId();
  const differs = pinsDiffer(pin, again);
  return (
    <>
      <div className="reg-field">
        <label htmlFor={first}>{say("reg.pin")}</label>
        <Cells id={first} text={say("web.ui.pinName")} value={pin} size={PIN_CELLS} secret onChange={(v) => setPin(pinDigits(v))}
          onPaste={(e) => { e.preventDefault(); setPin(pinDigits(e.clipboardData.getData("text"))); }} testid="pin" />
      </div>
      <div className="reg-field">
        <label htmlFor={second}>{label("web.register.pin_again")}</label>
        <Cells id={second} text={say("web.register.pin_again")} value={again} size={PIN_CELLS} secret onChange={(v) => setAgain(pinDigits(v))}
          onPaste={(e) => { e.preventDefault(); setAgain(pinDigits(e.clipboardData.getData("text"))); }} testid="pin-again"
          describedBy={differs ? differ : undefined} invalid={differs} />
        {differs && <p id={differ} className="reg-error">{say("reg.pinMismatch")}</p>}
      </div>
      {pin.length === PIN_CELLS && obviousPin(pin) && (
        <p className="reg-notice" role="status"><Icon d={clock} /><span>{say("app.reg.easy_pin")}</span></p>
      )}
    </>
  );
}

// The second and the fourth group of the paper code, typed back: four cells each over one input.
const PLACES = [2, 4] as const;
function GroupsStep({ typed, setTyped }: { typed: string[]; setTyped: (v: string[]) => void }) {
  const ids = [useId(), useId()];
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const write = (index: number, raw: string) => {
    const { next, focus } = layOutGroups(typed, index, raw, PLACES);
    setTyped(next);
    if (focus !== null) inputs.current[focus]?.focus();
  };
  return (
    <div role="group" aria-label={say("web.register.confirm")} data-testid="paper-groups">
      {PLACES.map((place, i) => (
        <div className="reg-field" key={place}>
          <label htmlFor={ids[i]}>{say("app.reg.type_group", { n: place })}</label>
          <Cells id={ids[i]} text={say("app.reg.type_group", { n: place })} value={typed[i] ?? ""} size={CODE_CELLS} onChange={(v) => write(i, v)}
            onPaste={(e) => { e.preventDefault(); write(i, e.clipboardData.getData("text")); }}
            onKeyDown={(e) => { if (e.key === "Backspace" && (typed[i] ?? "") === "" && i > 0) { e.preventDefault(); inputs.current[i - 1]?.focus(); } }}
            inputRef={(node) => { inputs.current[i] = node; }} />
        </div>
      ))}
    </div>
  );
}
