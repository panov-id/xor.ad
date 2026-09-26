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
      setError("группы не сходятся с кодом — проверьте, что записали");
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
          <header><h1>Кто вы</h1><span className="muted">1 / 2</span></header>
          <label>
            имя
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} data-testid="name" autoComplete="off" />
            <span className="muted">осталось {Math.max(0, NAME_MAX - count(name))}</span>
          </label>
          <label>
            возраст
            <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" data-testid="age" />
            <span className={age !== "" && ageNumber < AGE_MIN ? "warn" : "muted"}>сюда с 13 лет</span>
          </label>
          <label className="row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="consent" />
            <span>принимаю пользовательское соглашение, политику конфиденциальности и правила сообщества</span>
          </label>
          <button type="button" className="primary" disabled={!stepOneOk} onClick={() => setStep(2)} data-testid="next">
            дальше
          </button>
        </>
      )}
      {step === 2 && (
        <>
          <header><h1>ПИН</h1><span className="muted">2 / 2</span></header>
          <label>
            ПИН
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" data-testid="pin" />
          </label>
          <label>
            повторите ПИН
            <input type="password" value={pinAgain} onChange={(e) => setPinAgain(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" data-testid="pin-again" />
          </label>
          {pin.length === 6 && easyPin(pin) && <p className="warn">этот ПИН легко угадать</p>}
          {error && <p className="error" data-testid="error">{error}</p>}
          <button type="button" className="primary" disabled={!pinOk || busy} onClick={register} data-testid="register">
            {busy ? "ждём долю…" : "дальше"}
          </button>
        </>
      )}
      {step === 3 && (
        <>
          <header><h1>Бумажный код восстановления</h1></header>
          <p className="code" data-testid="paper-code">{groups.join(" ")}</p>
          <p className="muted">
            Запишите этот код на бумаге. Это единственный способ вернуть вашу личность: почты и пароля у нас нет, подсказать код мы не
            сможем, второй раз он показан не будет.
          </p>
          <p>Записали? Введите вторую и четвёртую группы.</p>
          <label>
            вторая
            <input value={second} onChange={(e) => setSecond(e.target.value)} data-testid="group-2" autoComplete="off" />
          </label>
          <label>
            четвёртая
            <input value={fourth} onChange={(e) => setFourth(e.target.value)} data-testid="group-4" autoComplete="off" />
          </label>
          {error && <p className="error" data-testid="error">{error}</p>}
          <button type="button" className="primary" disabled={busy || !second || !fourth} onClick={confirm} data-testid="confirm">
            готово
          </button>
        </>
      )}
    </main>
  );
}
