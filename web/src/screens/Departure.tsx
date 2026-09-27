// The device the identity leaves (T1; chat spec §8.2, screen 13; depth/ink
// move.ts MoveOut): the price, the PIN, nine characters to type elsewhere,
// then who asked and the four check characters, and only "it is me" moves
// anything. Words verbatim from depth/ink/locales/ru.json.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { Departure as Leaving, type MoveState } from "../../../depth/core/transfer_move.ts";
import { pinRefusal, say } from "../api/me.ts";
import { ENDINGS, MOVE_POLL_MS, useEvery } from "../api/transfer.ts";

export function Departure({ client, onBack, onGone }: { client: Client; onBack: () => void; onGone: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Leaving | null>(null);
  const [state, setState] = useState<MoveState>("waiting");
  const [left, setLeft] = useState(0);

  useEvery(MOVE_POLL_MS, () => out?.state().then(setState).catch((e: Error) => setError(e.message)), !!out && (state === "waiting" || state === "claimed") && !busy);
  useEffect(() => {
    if (!out || state !== "waiting") return;
    const end = Date.now() + out.expiresIn * 1000;
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [out, state]);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const opened = await Leaving.open(client, await client.pinProof(pin));
      if (opened instanceof Leaving) return setOut(opened);
      setError(pinRefusal(opened) ?? `the invitation was refused: ${opened.status}`);
      setPin("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function decide(yes: boolean) {
    if (!out) return;
    setBusy(true);
    setError(null);
    try {
      if (yes) {
        const answer = await out.approve();
        if (answer.status !== 200) return setError(`the approval was refused: ${answer.status}`);
        setState("approved");
      } else {
        await out.reject();
        setState("rejected");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ending = ENDINGS[state];
  return (
    <main className="screen departure" data-screen="departure" data-state={out ? state : "start"}>
      <header><h1>{say(state === "approved" ? "move.doneTitle" : "move.title")}</h1></header>
      {state === "approved"
        ? (
          <>
            <p data-testid="move-done">{say("move.done")}</p>
            <button type="button" className="primary" onClick={onGone} data-testid="move-exit">{say("common.back")}</button>
          </>
        )
        : ending
        ? (
          <>
            <p data-testid="move-ending">{say(ending)}</p>
            <button type="button" onClick={onBack} data-testid="move-back">{say("common.back")}</button>
          </>
        )
        : !out
        ? (
          <>
            <p className="muted">{say("move.intro")}</p>
            <p className="warn">{say("move.price")}</p>
            <label>
              {say("pin.current")}
              <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="move-pin" />
            </label>
            <button type="button" className="primary" disabled={pin.length !== 6 || busy} onClick={() => void open()} data-testid="move-go">{say("move.go")}</button>
            <button type="button" onClick={onBack} data-testid="move-back">{say("common.back")}</button>
          </>
        )
        : state === "claimed" && out.claimant
        ? (
          <>
            <p>{say("move.asks")}</p>
            <dl>
              <dt>{say("move.called")}</dt><dd data-testid="move-label">{out.claimant.label}</dd>
              <dt>{say("move.when")}</dt><dd>{Date.now() - out.seenAt < 10_000 ? say("move.justNow") : say("move.secondsAgo", { n: Math.round((Date.now() - out.seenAt) / 1000) })}</dd>
              <dt>{say("move.check")}</dt><dd data-testid="move-check">{out.check}</dd>
            </dl>
            <p className="muted">{say("move.checkAsk")}</p>
            <p className="muted">{say("move.leaves")}</p>
            <button type="button" className="primary" disabled={busy} onClick={() => void decide(true)} data-testid="move-yes">{say("move.yes")}</button>
            <button type="button" disabled={busy} onClick={() => void decide(false)} data-testid="move-no">{say("move.no")}</button>
          </>
        )
        : (
          <>
            <p className="code" data-testid="move-code">{out.groups.join(" ")}</p>
            <p className="muted">{say("move.codeWhere")}</p>
            <p className="muted">{say("move.codeLife", { n: left })}</p>
            <p className="muted">{say("move.nobody")}</p>
            <button type="button" disabled={busy} onClick={() => void decide(false)} data-testid="move-stop">{say("move.stop")}</button>
          </>
        )}
      {error && <p className="error" data-testid="error">{error}</p>}
    </main>
  );
}
