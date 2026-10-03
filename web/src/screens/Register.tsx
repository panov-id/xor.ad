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

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { newPaperCode, paperGroups, readPaperText } from "../../../depth/core/paper.ts";
import { openSealed, registerAndKeep, type Record_ } from "../vault.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const count = (s: string) => [...graphemes.segment(s)].length;
const NAME_MAX = 24;
const AGE_MIN = 13;

function easyPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  if ("0123456789".includes(pin) || "9876543210".includes(pin)) return true;
  const year = Number(pin.slice(1, 5));
  return year >= 1930 && year <= 2020;
}

export function Register({ onDone }: { onDone: (client: Client, sealed: "ok" | "failed") => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");
  const [code] = useState(() => newPaperCode());
  const [second, setSecond] = useState("");
  const [fourth, setFourth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ client: Client; record: Record_; share: Uint8Array } | null>(null);

  const ageNumber = Number(age);
  const stepOneOk = name.trim().length > 0 && count(name) <= NAME_MAX && Number.isInteger(ageNumber) && ageNumber >= AGE_MIN && consent;
  const pinOk = /^\d{6}$/.test(pin) && pin === pinAgain;
  const groups = paperGroups(code);

  async function register() {
    setBusy(true);
    setError(null);
    try {
      const { client, record, share } = await registerAndKeep({ name: name.trim(), age: ageNumber }, { pin, paperCode: code });
      setMade({ client, record, share });
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!made) return;
    if (readPaperText(second) !== groups[1] || readPaperText(fourth) !== groups[3]) {
      setError(say("web.register.groups_mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await made.client.confirmPaperCode();
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

  return (
    <main className="screen register" data-screen={`register-${step}`}>
      {step === 1 && (
        <>
          <HeaderScreen title={say("web.register.who")} action={<span className="ui-step">1/2</span>} />
          <label>
            {say("reg.name")}
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} data-testid="name" autoComplete="off" />
            <span className="muted">{say("web.register.left", { count: Math.max(0, NAME_MAX - count(name)) })}</span>
          </label>
          <label>
            {say("reg.age")}
            <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" data-testid="age" />
            <span className={age !== "" && ageNumber < AGE_MIN ? "warn" : "muted"}>{say("web.register.age_min")}</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="consent" />
            <span>{say("web.register.consent")}</span>
          </label>
          <Button type="button" kind="primary" icon="open" className="ui-wide ui-foot" aria-label={say("reg.next")} disabled={!stepOneOk} onClick={() => setStep(2)} data-testid="next" />
        </>
      )}
      {step === 2 && (
        <>
          <HeaderScreen title={say("reg.pin")} action={<span className="ui-step">2/2</span>} />
          <label>
            {say("reg.pin")}
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" data-testid="pin" />
          </label>
          <label>
            {say("web.register.pin_again")}
            <input type="password" value={pinAgain} onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" data-testid="pin-again" />
          </label>
          {pin.length === 6 && easyPin(pin) && <p className="warn">{say("web.register.easy_pin")}</p>}
          {error && <p className="error" data-testid="error">{error}</p>}
          <Button type="button" kind="primary" icon="open" className="ui-wide ui-foot" aria-label={busy ? say("web.register.waiting") : say("reg.next")} aria-busy={busy} disabled={!pinOk || busy} onClick={register} data-testid="register" />
        </>
      )}
      {step === 3 && (
        <>
          <HeaderScreen title={say("web.register.paper_title")} />
          <p className="code" data-testid="paper-code">{groups.join(" ")}</p>
          <div className="ui-info-row"><Info label={say("web.register.paper_title")} data-testid="paper-info"><p>{say("web.register.paper_text")}</p></Info></div>
          <p>{say("web.register.confirm")}</p>
          <label>
            {say("web.register.second")}
            <input value={second} onChange={(e) => setSecond(e.target.value)} data-testid="group-2" autoComplete="off" />
          </label>
          <label>
            {say("web.register.fourth")}
            <input value={fourth} onChange={(e) => setFourth(e.target.value)} data-testid="group-4" autoComplete="off" />
          </label>
          {error && <p className="error" data-testid="error">{error}</p>}
          <Button type="button" kind="primary" icon="check" className="ui-wide ui-foot" aria-label={say("web.register.done")} disabled={busy || !second || !fourth} onClick={confirm} data-testid="confirm" />
        </>
      )}
    </main>
  );
}
