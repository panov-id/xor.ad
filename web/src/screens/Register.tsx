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

import { useEffect, useState } from "react";
import { Client } from "../../../depth/core/client.ts";
import { type LegalRevision, readManifest } from "../../../depth/core/legal.ts";
import { API_KEY, NODE_BASE } from "../config.ts";
import { acceptAndKeep, LegalLinks } from "./Legal.tsx";
import { newPaperCode, paperGroups, readPaperText } from "../../../depth/core/paper.ts";
import { openSealed, registerAndKeep, type Record_ } from "../vault.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import { obviousPin } from "../pinWords.ts";

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const count = (s: string) => [...graphemes.segment(s)].length;
const NAME_MAX = 24;
const AGE_MIN = 13;

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
  const stepOneOk = name.trim().length > 0 && count(name) <= NAME_MAX && Number.isInteger(ageNumber) && ageNumber >= AGE_MIN && agreed;
  const pinOk = /^\d{6}$/.test(pin) && pin === pinAgain;
  const groups = paperGroups(code);

  async function register() {
    setBusy(true);
    setError(null);
    try {
      const { client, record, share } = await registerAndKeep({ name: name.trim(), age: ageNumber }, { pin, paperCode: code });
      // The boxes ticked on step one go to the node now: an accept is signed,
      // and only now is there someone to sign it. A failure here is not the
      // registration's: screen 15 asks again at start-up.
      if (revisions) await acceptAndKeep(client, revisions).catch(() => null);
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
          {revisions && <LegalLinks revisions={revisions} />}
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
          {pin.length === 6 && obviousPin(pin) && <p className="warn">{say("web.register.easy_pin")}</p>}
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
