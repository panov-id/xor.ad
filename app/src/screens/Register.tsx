// docs/newdesign4 screens 02–05 and 05a (register-1, -2, -2b, -3, -3-check; SCREENS_spec §2–5а): the web's registration
// (web/src/screens/Register.tsx) in the new design. Three steps, as the web has them:
//   1 · who you are: a name up to 24 graphemes, an age from 13, the consent to the three documents;
//   2 · the PIN, then 2b · the same PIN again on its own screen, each on the PIN's own pad (pin-flow.ts; sheets
//       register-2 and register-2b): the sixth digit moves on by itself, a repeat that differs is typed again and says so (the third miss goes back),
//       an easy PIN warns on the repeat and does not stop;
//   3 · the paper code, shown once, then two of its four groups typed back, a new pair each time (pin-flow.ts pickPair).
// Every rule is the SDK's (depth/core/register.ts, shared with the web), the registration itself too
// (enroll.ts registerIdentity, openSealed); this file is the words, the screen and the order of calls.
// The same testids as the web's: name, age, next, pin, pin-again, register, paper-code, paper-say,
// paper-groups, confirm, steps, error, register-left, register-age-min, legal-links, legal-link-<doc>; and wrote, show-again,
// register-back, pad-eye. The asked groups are on paper-groups as data-pair="1,4" and on each input as data-group.
//
// The record is kept on this disk at once, as the web does (vault.ts registerAndKeep: IndexedDB "xor-vault", the
// reload grace armed), so a reload after step two finds an identity and asks its PIN (Unlock.tsx).
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { brand } from "@brand";
import { Client } from "@sdk/client.ts";
import { openSealed, type Record_ } from "@sdk/enroll.ts";
import { acceptAll, acceptedKey, documentAddress, inLegalOrder, keepAcceptedIn, type LegalRevision, readAcceptedIn, readManifest } from "@sdk/legal.ts";
import { readPaperText } from "@sdk/paper_text.ts";
import { newPaperCode, paperGroups } from "@sdk/paper.ts";
import { obviousPin } from "@sdk/pin.ts";
import {
  AGE_MIN, layOutGroups, lettersLeft, NAME_MAX, ageDigits, isYoung, pinDigits, refusalOf, whyGroups, whyNext, whyPin,
} from "@sdk/register.ts";
import { API_KEY, NODE_BASE } from "../config";
import { failedLine, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { registerAndKeep } from "../vault";
import { Cells, CodePlate, PIN_CELLS, PinPad } from "./register-parts";
import { afterDigits, pickPair, pressed as padPressed, type PinStage } from "./pin-flow";
import { NameCard } from "./Splash";

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

export function Register({ onDone, onRestore, onArrive, onBack }: { onDone: (seated: Seated) => void; onRestore: () => void; onArrive: () => void; onBack: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [stage, setStage] = useState<PinStage>("pin");
  const [mismatch, setMismatch] = useState(false);
  const [misses, setMisses] = useState(0);
  const [checking, setChecking] = useState(false);
  const [pair, setPair] = useState(() => pickPair(null));
  const nameId = useId(), ageId = useId();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [pressed, setPressed] = useState(0);
  useEffect(() => setPressed(0), [step]);
  const [code] = useState(() => newPaperCode());
  const [typed, setTyped] = useState<string[]>(["", ""]);
  const [first, second] = typed;
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
  const reasonGroups = whyGroups(first, second, true) ? say("web.register.why_groups") : null;
  const restartPin = () => { setPin(""); setPinAgain(""); setMismatch(false); setMisses(0); setStage("pin"); };

  // The sixth digit moves on: to the repeat, or, repeated, to the creation; a repeat that differs is typed again.
  useEffect(() => {
    if (step !== 2 || busy) return;
    const move = afterDigits({ stage, pin, again: pinAgain, mismatch, misses });
    if (move.stage === stage && !move.create && move.misses === misses) return;
    const t = setTimeout(() => {
      setStage(move.stage); setPin(move.pin); setPinAgain(move.again); setMismatch(move.mismatch); setMisses(move.misses ?? 0);
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
    if (readPaperText(first) !== groups[pair[0]] || readPaperText(second) !== groups[pair[1]]) { setError(say("web.register.groups_mismatch")); return; }
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

  const ordered = revisions ? inLegalOrder(revisions) : [];
  const docOf = (doc: "terms" | "privacy") => ordered.find((r) => r.document === doc)?.document ?? doc;

  // screen 02: «back» leaves for the start; 03 goes to 02; 04 starts the PIN over («Lost it? Go back»); 05a goes to 05.
  // On 05 the identity is made already: no way back from it.
  const back = step === 1 ? onBack : step === 2 ? (stage === "again" ? restartPin : () => setStep(1)) : checking ? () => setChecking(false) : null;
  const screenId = step === 1 ? "register-1" : step === 2 ? (stage === "again" ? "register-2b" : "register-2") : checking ? "register-3-check" : "register-3";

  // The foot: the reason the primary is shut (read at once, drawn after a press on it), then the primary,
  // outlined and grey while shut. `aria-disabled`, never `disabled`: it keeps its focus.
  const foot = (reason: string | null, pending: boolean, button: { testid: string; word: string; icon?: string; onClick: () => void }) => (
    <div className="nd-foot" onClickCapture={(e) => { if ((e.target as Element).closest('[aria-disabled="true"]')) setPressed((n) => n + 1); }}>
      {reason && <p key={pressed} id={why} className={pressed > 0 ? "nd-note" : "nd-note sr-only"} data-pressed={pressed > 0 ? "yes" : undefined} role={pressed > 0 ? "alert" : undefined}>{reason}</p>}
      <button type="button" className="nd-cta" data-quiet={reason ? "" : undefined} aria-disabled={reason || pending ? true : undefined} aria-describedby={reason ? why : undefined}
        aria-busy={pending || undefined} onClick={button.onClick} data-testid={button.testid}>
        {button.icon && !pending && <NdIcon name={button.icon} />}{pending ? say("web.register.waiting") : button.word}
      </button>
    </div>
  );

  // docs/newdesign4 screens 02–05: on a phone the steps stand on the background; on a tablet and a laptop the name card
  // of screen 01 stands by them and the steps are its form panel.
  return (
    <main className="k-screen nd-screen" data-screen={screenId}>
      <div className="nd-col nd-split nd-reg-split">
        <NameCard />
        <div className="nd-form nd-reg" key={screenId}>
          <header className="nd-head">
            {back ? <button type="button" className="nd-back" aria-label={say("app.reg.back")} onClick={back} disabled={busy} data-testid="register-back"><NdIcon name="back" /></button> : <span className="nd-back-gap" />}
            <span className="nd-dots" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step} aria-label={say("web.register.step", { n: step, m: 3 })} data-testid="steps">
              {[1, 2, 3].map((n) => <i key={n} data-done={n <= step ? "" : undefined} data-now={n === step ? "" : undefined} />)}
            </span>
            <span className="nd-back-gap" />
          </header>
          {step === 1 && (
            <>
              <div className="nd-title"><h1 className="nd-h1">{say("app.reg.who")}</h1><p className="nd-sub">{say("app.reg.who_1")}<br />{say("app.reg.who_2")}</p></div>
              <label className="nd-label" htmlFor={nameId}>{say("app.reg.name")}</label>
              <div className="nd-field">
                <input id={nameId} type="text" autoComplete="nickname" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} data-testid="name" />
                <span className="nd-count" data-testid="register-left">{NAME_MAX - lettersLeft(name)} / {NAME_MAX}</span>
              </div>
              <label className="nd-label" htmlFor={ageId}>{say("app.reg.age")}</label>
              <div className="nd-stepper">
                <button type="button" className="nd-step" aria-label={say("app.reg.age_less")} aria-disabled={Number(age) <= AGE_MIN || undefined}
                  onClick={() => { if (Number(age) > AGE_MIN) setAge(ageDigits(String(Number(age) - 1))); else if (!age) setAge(String(AGE_MIN)); }} data-testid="age-less"><NdIcon name="back" /></button>
                <input id={ageId} className="nd-age" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="—" value={age} aria-invalid={young || undefined}
                  onChange={(e) => setAge(ageDigits(e.target.value))} data-testid="age" />
                <button type="button" className="nd-step" aria-label={say("app.reg.age_more")} onClick={() => setAge(ageDigits(String(Math.max(AGE_MIN - 1, Number(age) || 0) + 1)))} data-testid="age-more"><NdIcon name="chev" /></button>
              </div>
              {young && <p className="nd-note" role="alert" data-state="young" data-testid="register-age-min">{say("web.register.age_min")}</p>}
              <label className="nd-check">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="consent" />
                <span className="nd-box" aria-hidden="true"><NdIcon name="check" /></span>
                <span data-testid="legal-links">{say("app.reg.agree").split(/(\{terms\}|\{privacy\})/).map((part, i) => {
                  const doc = part === "{terms}" ? "terms" : part === "{privacy}" ? "privacy" : null;
                  return doc ? <a key={i} className="nd-link" href={documentAddress(brand.host, docOf(doc))} target="_blank" rel="noopener noreferrer" data-testid={`legal-link-${doc}`}
                    onClick={(e) => e.stopPropagation()}>{say(`app.splash.${doc}`)}</a> : part;
                })}</span>
              </label>
              <div className="nd-grow" />
              {/* screen 02: the ways in for someone who already has sosed, moved here from the old splash */}
              <p className="nd-have" data-testid="register-have">
                <span>{say("app.reg.have")}</span><br />
                <button type="button" className="nd-link" onClick={onRestore} data-testid="restore">{say("app.reg.have_code")}</button>
                <span aria-hidden="true"> · </span>
                <button type="button" className="nd-link" onClick={onArrive} data-testid="arrive">{say("app.reg.have_move")}</button>
              </p>
              {foot(reasonNext, false, { testid: "next", word: say("web.offer.continue"), onClick: () => { if (!reasonNext) setStep(2); } })}
            </>
          )}
          {step === 2 && (
            <PinStep stage={stage} pin={pin} again={pinAgain} mismatch={mismatch} busy={busy}
              onKey={(k) => { if (stage === "pin") { setPin((p) => padPressed(p, k)); setMismatch(false); } else { setPinAgain((p) => padPressed(p, k)); setMismatch(false); } }}
              setPin={(v) => { setPin(v); setMismatch(false); }} setAgain={(v) => { setPinAgain(v); setMismatch(false); }}
              note={error ? <p className="nd-note" role="alert" data-testid="error">{error}</p> : null}
              retry={error && !busy && stage === "again" && pinAgain.length === PIN_CELLS ? <button type="button" className="nd-cta" onClick={() => void register()} data-testid="register-retry">{say("app.feed.retry")}</button> : null} />
          )}
          {step === 3 && !checking && (
            <>
              <div className="nd-title"><h1 className="nd-h1">{say("app.reg.paper_your")}</h1><p className="nd-sub">{say("app.reg.paper_1")}<br />{say("app.reg.paper_2")}</p></div>
              <CodePlate groups={groups} />
              <div className="nd-grow" />
              <Tile icon="paper" line={say("app.reg.paper_tile_1", { name: brand.name })} quiet={say("app.reg.paper_tile_2")} />
              {foot(null, false, { testid: "wrote", word: say("app.reg.wrote"), icon: "pen", onClick: () => { setTyped(["", ""]); setError(null); setChecking(true); } })}
            </>
          )}
          {step === 3 && checking && (
            <>
              <div className="nd-title"><h1 className="nd-h1">{say("app.reg.check_title")}</h1>
                <p className="nd-sub">{say("app.reg.check_1", { a: pair[0] + 1, b: pair[1] + 1 })}<br />{say("app.reg.check_2")}</p></div>
              <GroupsStep pair={pair} typed={typed} setTyped={(v) => { setTyped(v); setError(null); }} wrong={!!error} />
              {error && <p className="nd-note" role="alert" data-testid="error">{error}</p>}
              <div className="nd-grow" />
              <p className="nd-have"><span>{say("app.reg.check_none")}</span><br />
                <button type="button" className="nd-link" onClick={() => { setPair((p) => pickPair(p)); setChecking(false); }} data-testid="show-again">{say("app.reg.check_again")}</button></p>
              {foot(reasonGroups, busy, { testid: "confirm", word: say("app.reg.done"), onClick: confirm })}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

/** A quiet tile over the pad or the button: its mark, a line, and a grey line under it (screens 03, 04, 05). */
export function Tile({ icon, line, quiet, accent }: { icon: string; line: string; quiet: string; accent?: string | null }) {
  return (
    <div className="nd-tile" data-testid="register-tile">
      <NdIcon name={icon} />
      <span>{line}<br /><span className={accent ? "nd-accent" : "nd-quiet"} role={accent ? "alert" : undefined} data-testid={accent ? "pin-mismatch" : undefined}>{accent ?? quiet}</span></span>
    </div>
  );
}

/** The PIN's two screens (03, 04); `make` gives the first its own words where another flow borrows them (restore 11 and
 *  arrival 14: «PIN for this device»). */
export function PinStep({ stage, pin, again, mismatch, busy, onKey, setPin, setAgain, note, retry, make }: {
  stage: PinStage; pin: string; again: string; mismatch: boolean; busy: boolean; onKey: (k: string) => void;
  setPin: (v: string) => void; setAgain: (v: string) => void; note: ReactNode; retry: ReactNode;
  make?: { title: string; sub: string; icon: string; line: string; quiet: string };
}) {
  const field = useId();
  const first = stage === "pin";
  const value = first ? pin : again, set = first ? setPin : setAgain;
  // SCREENS_spec §3а: «show digits» lasts while on this screen; it goes off on leaving it or when the app is hidden
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const hide = () => { if (document.hidden) setShown(false); };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [stage]);
  return (
    <>
      <div className="nd-title">
        <h1 className="nd-h1">{first && make ? make.title : say(first ? "app.reg.pin_make" : "app.reg.pin_repeat")}</h1>
        <p className="nd-sub">{first && make ? make.sub : say(first ? "app.reg.pin_make_1" : "app.reg.pin_repeat_1")}</p>
      </div>
      <div className="nd-pin" data-stage={stage} data-shake={mismatch ? "" : undefined}>
        <Cells id={field} text={first ? say("web.ui.pinName") : say("web.register.pin_again")} value={value} size={PIN_CELLS} secret={!shown}
          onChange={(v) => set(pinDigits(v))} onPaste={(e) => { e.preventDefault(); set(pinDigits(e.clipboardData.getData("text"))); }}
          testid={first ? "pin" : "pin-again"} invalid={mismatch || undefined} />
      </div>
      {!first && pin.length === PIN_CELLS && obviousPin(pin) && <p className="nd-note" role="status">{say("app.reg.easy_pin")}</p>}
      {busy && <p className="nd-sub" role="status" data-testid="register-busy">{say("web.register.waiting")}</p>}
      {note}
      <div className="nd-grow" />
      {first
        ? <Tile icon={make?.icon ?? "lock"} line={make?.line ?? say("app.reg.pin_tile_1", { name: brand.name })} quiet={make?.quiet ?? say("app.reg.pin_tile_2")} />
        : <Tile icon="refresh" line={say("app.reg.again_1")} quiet={say("app.reg.again_2")} accent={mismatch ? say("app.reg.pin_differ") : null} />}
      {retry ?? <PinPad onKey={onKey} disabled={busy} shown={shown} onEye={() => setShown((s) => !s)} />}
    </>
  );
}

// SCREENS_spec §5a: two groups of the four, a new pair each time; the other two are closed and dim.
function GroupsStep({ pair, typed, setTyped, wrong }: { pair: readonly [number, number]; typed: string[]; setTyped: (v: string[]) => void; wrong: boolean }) {
  const ids = [useId(), useId()];
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const places = [pair[0] + 1, pair[1] + 1] as const;
  useEffect(() => { inputs.current[0]?.focus(); }, [pair]);
  const write = (index: number, raw: string) => {
    const { next, focus } = layOutGroups(typed, index, raw, places);
    setTyped(next);
    if (focus !== null) inputs.current[focus]?.focus();
  };
  return (
    <div className="nd-groups" role="group" aria-label={say("app.reg.check_title")} data-testid="paper-groups" data-pair={places.join(",")} data-shake={wrong ? "" : undefined}>
      {[0, 1, 2, 3].map((g) => {
        const i = pair.indexOf(g);
        if (i < 0) return <span key={g} className="nd-group" data-closed="" aria-hidden="true"><small>{g + 1}</small><b>••••</b></span>;
        return (
          <label key={g} className="nd-group" htmlFor={ids[i]}>
            <small>{g + 1}</small>
            <input id={ids[i]} aria-label={say("app.reg.type_group", { n: g + 1 })} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={9}
              value={typed[i] ?? ""} aria-invalid={wrong || undefined} data-group={g + 1} ref={(node) => { inputs.current[i] = node; }}
              onChange={(e) => write(i, e.target.value)} onPaste={(e) => { e.preventDefault(); write(i, e.clipboardData.getData("text")); }}
              onKeyDown={(e) => { if (e.key === "Backspace" && (typed[i] ?? "") === "" && i > 0) { e.preventDefault(); inputs.current[i - 1]?.focus(); } }} />
          </label>
        );
      })}
    </div>
  );
}
