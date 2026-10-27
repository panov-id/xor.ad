// The prototype's register-1..3 (docs/newdesign/proto/register-*.html): the web's registration
// (web/src/screens/Register.tsx) in the new design. Three steps, as the web has them:
//   1 · who you are: a name up to 24 graphemes, an age from 13, the consent to the three documents;
//   2 · the PIN, then 2b · the same PIN again on its own screen, each on the PIN's own pad (pin-flow.ts; sheets
//       register-2 and register-2b): the sixth digit moves on by itself, a repeat that differs goes back and says so,
//       an easy PIN warns on the repeat and does not stop;
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
  groupsMatch, layOutGroups, lettersLeft, NAME_MAX, ageDigits, isYoung, pinDigits, refusalOf, whyGroups, whyNext, whyPin,
} from "@sdk/register.ts";
import { API_KEY, NODE_BASE } from "../config";
import { failedLine, label, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { registerAndKeep } from "../vault";
import { CODE_CELLS, Cells, CodePlate, Field, PIN_CELLS, PinPad, StepHead } from "./register-parts";
import { afterDigits, pressed as padPressed, type PinStage } from "./pin-flow";

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
  const [stage, setStage] = useState<PinStage>("pin");
  const [mismatch, setMismatch] = useState(false);
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
  const reasonGroups = whyGroups(second, fourth, true) ? say("web.register.why_groups") : null;

  // The sixth digit moves on: to the repeat, or, repeated, to the creation; a repeat that differs starts over.
  useEffect(() => {
    if (step !== 2 || busy) return;
    const move = afterDigits({ stage, pin, again: pinAgain, mismatch });
    if (move.stage === stage && !move.create) return;
    const t = setTimeout(() => {
      setStage(move.stage); setPin(move.pin); setPinAgain(move.again); setMismatch(move.mismatch);
      if (move.create) void register();
    }, move.create ? 0 : 180);
    return () => clearTimeout(t);
  }, [step, stage, pin, pinAgain]);

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

  // The foot (the prototype's action panel): the reason the primary is shut (read by a screen reader at once, drawn after a
  // press on the closed primary), then the primary, quiet on the tile while shut. `aria-disabled`, never `disabled`: it keeps its focus.
  const foot = (reason: string | null, pending: boolean, button: { testid: string; word: string; icon: string; onClick: () => void }) => (
    <section className="k-panel k-actions" onClickCapture={(e) => { if ((e.target as Element).closest('[aria-disabled="true"]')) setPressed((n) => n + 1); }}>
      {reason && <p key={pressed} id={why} className={pressed > 0 ? "k-note" : "k-note sr-only"} data-pressed={pressed > 0 ? "yes" : undefined} role={pressed > 0 ? "alert" : undefined}>{reason}</p>}
      <button type="button" className="k-cta" data-quiet={reason ? "" : undefined} aria-disabled={reason || pending ? true : undefined} aria-describedby={reason ? why : undefined}
        aria-busy={pending || undefined} onClick={button.onClick} data-testid={button.testid}>
        <NdIcon name={button.icon} /><span>{pending ? say("web.register.waiting") : button.word}</span>
      </button>
    </section>
  );

  // the prototype's register-1..3: the bar with the title and the step dots, the panel, the action panel
  return (
    <main className="k-screen" data-screen={step === 2 && stage === "again" ? "register-2b" : `register-${step}`}>
      <div className="k-col">
        <StepHead n={step} of={3} title={title} />
        <section className="k-panel k-grow k-reg" key={step === 2 ? `2${stage}` : step}>
          <p className="k-sub">{sub}</p>
          {step === 1 && (
            <>
              <div className="k-ava-hero" aria-hidden="true"><NdIcon name="me" /></div>
              <Field text={say("app.reg.name")} value={name} onChange={setName} maxLength={64} testid="name"
                side={<span className="k-meta" data-testid="register-left">{say("app.reg.left", { n: lettersLeft(name), max: NAME_MAX })}</span>} />
              <div className="k-stepper">
                <button type="button" aria-label={say("app.reg.age_less")} onClick={() => setAge(ageDigits(String(Math.max(0, (Number(age) || 14) - 1))))} data-testid="age-less"><NdIcon name="back" /></button>
                <Field text={say("app.reg.age")} kind="number" icon="clock" value={age} onChange={(v) => setAge(ageDigits(v))} testid="age" invalid={young} />
                <button type="button" aria-label={say("app.reg.age_more")} onClick={() => setAge(ageDigits(String((Number(age) || 12) + 1)))} data-testid="age-more"><NdIcon name="chev" /></button>
              </div>
              <p className="k-sub" data-state={young ? "young" : undefined} data-testid="register-age-min">{say("web.register.age_min")}</p>
              <div className="k-reg-foot">
                {ordered.length > 0 && (
                  <ul className="k-docs" data-testid="legal-links">
                    {ordered.map((r, i) => (
                      <li key={r.document}>
                        <a className="k-fact" href={documentAddress(brand.host, r.document)} target="_blank" rel="noopener noreferrer" data-testid={`legal-link-${r.document}`}
                          aria-label={`${say(`web.legal.${r.document}`)} ${say("web.ui.newTab")}`}>
                          <span className="k-badge" data-c={["1", "4", "3"][i % 3]}><NdIcon name={["doc", "eye", "phrase"][i % 3]} /></span>
                          <span aria-hidden="true">{say(`web.legal.short.${r.document}`)}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="k-check k-consent">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="consent" />
                  <span className="k-box" aria-hidden="true"><NdIcon name="check" /></span>
                  <span>{say("web.register.consent")}</span>
                </label>
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <PinStep stage={stage} pin={pin} again={pinAgain} mismatch={mismatch} busy={busy}
                onKey={(k) => { if (stage === "pin") { setPin((p) => padPressed(p, k)); setMismatch(false); } else setPinAgain((p) => padPressed(p, k)); }}
                setPin={(v) => { setPin(v); setMismatch(false); }} setAgain={setPinAgain} />
              {error && <div data-testid="error"><p className="k-note" data-tone="error" role="alert">{error}</p></div>}
            </>
          )}
          {step === 3 && (
            <>
              <CodePlate groups={groups} />
              <GroupsStep typed={typed} setTyped={setTyped} />
              {error && <div data-testid="error"><p className="k-note" data-tone="error" role="alert">{error}</p></div>}
            </>
          )}
        </section>
        {step === 1 && foot(reasonNext, false, { testid: "next", word: say("app.reg.next_pin"), icon: "chev", onClick: () => { if (!reasonNext) setStep(2); } })}
        {/* the node refused or was away with both PINs typed: the pad takes no seventh digit, so the same PINs go again */}
        {step === 2 && error && !busy && stage === "again" && pinAgain.length === PIN_CELLS && (
          <section className="k-panel k-actions"><button type="button" className="k-cta" onClick={() => void register()} data-testid="register-retry"><NdIcon name="refresh" /><span>{say("app.feed.retry")}</span></button></section>
        )}
        {step === 3 && foot(reasonGroups, busy, { testid: "confirm", word: label("web.register.done"), icon: "check", onClick: confirm })}
      </div>
    </main>
  );
}

function PinStep({ stage, pin, again, mismatch, busy, onKey, setPin, setAgain }: {
  stage: PinStage; pin: string; again: string; mismatch: boolean; busy: boolean; onKey: (k: string) => void;
  setPin: (v: string) => void; setAgain: (v: string) => void;
}) {
  const field = useId(), said = useId();
  const first = stage === "pin";
  const value = first ? pin : again, set = first ? setPin : setAgain;
  // register-2 / 2b: the pin mark, six dots over the one real input, the notice tile, the pad at the foot
  return (
    <>
      <NdIcon name="pin" className="k-big-icon k-mid" />
      <div className="k-pin" data-stage={stage}>
        <label htmlFor={field} className="k-sub">{first ? say("reg.pin") : label("web.register.pin_again")}</label>
        <Cells id={field} text={first ? say("web.ui.pinName") : say("web.register.pin_again")} value={value} size={PIN_CELLS} secret
          onChange={(v) => set(pinDigits(v))} onPaste={(e) => { e.preventDefault(); set(pinDigits(e.clipboardData.getData("text"))); }}
          testid={first ? "pin" : "pin-again"} describedBy={mismatch ? said : undefined} invalid={mismatch || undefined} />
      </div>
      {mismatch && first && <p id={said} className="k-note" data-tone="error" role="alert" data-testid="pin-mismatch"><NdIcon name="alert" /><span>{say("reg.pinMismatch")}</span></p>}
      {!first && pin.length === PIN_CELLS && obviousPin(pin) && (
        <p className="k-note" role="status"><NdIcon name="alert" /><span>{say("app.reg.easy_pin")}</span></p>
      )}
      {busy && <p className="k-sub" role="status" data-testid="register-busy">{say("web.register.waiting")}</p>}
      <PinPad onKey={onKey} disabled={busy} />
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
    <div className="k-stack" role="group" aria-label={say("web.register.confirm")} data-testid="paper-groups">
      <hr className="k-rule" />
      <p className="k-row"><NdIcon name="pen" /><span className="k-sub">{say("web.register.confirm")}</span></p>
      <div className="k-type-row">
      {PLACES.map((place, i) => (
        <div className="k-type" key={place}>
          <label htmlFor={ids[i]} className="k-meta">{say("app.reg.type_group", { n: place })}</label>
          <Cells id={ids[i]} text={say("app.reg.type_group", { n: place })} value={typed[i] ?? ""} size={CODE_CELLS} onChange={(v) => write(i, v)}
            onPaste={(e) => { e.preventDefault(); write(i, e.clipboardData.getData("text")); }}
            onKeyDown={(e) => { if (e.key === "Backspace" && (typed[i] ?? "") === "" && i > 0) { e.preventDefault(); inputs.current[i - 1]?.focus(); } }}
            inputRef={(node) => { inputs.current[i] = node; }} />
        </div>
      ))}
      </div>
    </div>
  );
}
