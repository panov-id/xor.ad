// The device the identity arrives at (T1; chat spec §8.2, screen 13; depth/ink
// move.ts MoveIn): nine characters from the old device, the four check
// characters to compare there, and after "it is me" a first PIN, which seals
// the identity on this device as a raise by the paper code does. Words
// verbatim from depth/ink/locales/ru.json.

import { useRef, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { readPaperText } from "../../../depth/core/paper.ts";
import type { MoveState } from "../../../depth/core/transfer_move.ts";
import { say } from "../api/me.ts";
import { browserLabel, ENDINGS, MOVE_POLL_MS, useEvery } from "../api/transfer.ts";
import { type Arriving, claimArrival, keepArrived } from "../vault.ts";

export function Arrival({ onDone, onBack }: { onDone: (client: Client, longKey: CryptoKey) => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [into, setInto] = useState<Arriving | null>(null);
  const [state, setState] = useState<MoveState>("claimed");
  const arrived = useRef(false);
  const clean = readPaperText(code);

  useEvery(MOVE_POLL_MS, () => into?.arrival.state().then((next) => {
    if (next === "approved") arrived.current = true;
    setState(next);
  }).catch((e: Error) => setError(e.message)), !!into && state === "claimed");

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const claimed = await claimArrival(clean, browserLabel());
      if ("arrival" in claimed) return setInto(claimed);
      if (claimed.status === 404) return setError(say("move.codeBad"));
      if (claimed.status === 409) return setError(say("move.twice"));
      if (claimed.status === 429) return setError(say("pin.wait", { n: String(claimed.retryAfter ?? "?") }));
      setError(`the claim was refused: ${claimed.status}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    if (!into) return;
    setBusy(true);
    setError(null);
    try {
      const { client, longKey } = await keepArrived(into, pin);
      onDone(client, longKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ending = ENDINGS[state];
  return (
    <main className="screen arrival" data-screen="arrival" data-state={into ? state : "start"}>
      <header><h1>{say(state === "approved" ? "move.arrivedTitle" : "move.inTitle")}</h1></header>
      {!into
        ? (
          <>
            <p className="muted">{say("move.inIntro")}</p>
            <label>
              {say("move.code")}
              <input value={code} onChange={(e) => setCode(e.target.value.slice(0, 13))} data-testid="arrive-code" autoComplete="off" />
            </label>
            {busy && <p className="muted">{say("move.deriving")}</p>}
            <button type="button" className="primary" disabled={clean.length !== 9 || busy} onClick={() => void claim()} data-testid="arrive-go">{say("reg.next")}</button>
            <button type="button" onClick={onBack} data-testid="arrive-back">{say("common.back")}</button>
          </>
        )
        : ending
        ? (
          <>
            <p data-testid="move-ending">{say(ending)}</p>
            <button type="button" onClick={onBack} data-testid="arrive-back">{say("common.back")}</button>
          </>
        )
        : state === "approved"
        ? (
          <>
            <p className="muted">{say("move.arrived")}</p>
            <label>
              {say("pin.next")}
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="arrive-pin" />
            </label>
            <label>
              {say("pin.again")}
              <input type="password" inputMode="numeric" value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="arrive-pin-again" />
            </label>
            {pin.length === 6 && again.length === 6 && pin !== again && <p className="error">{say("reg.pinMismatch")}</p>}
            <button type="button" className="primary" disabled={!/^\d{6}$/.test(pin) || pin !== again || busy} onClick={() => void keep()} data-testid="arrive-keep">{say("reg.next")}</button>
          </>
        )
        : (
          <>
            <dl>
              <dt>{say("move.check")}</dt><dd data-testid="arrive-check">{into.arrival.check}</dd>
            </dl>
            <p className="muted">{say("move.inWait")}</p>
          </>
        )}
      {error && <p className="error" data-testid="error">{error}</p>}
    </main>
  );
}
