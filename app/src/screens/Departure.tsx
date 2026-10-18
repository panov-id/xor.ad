// w2_departure-start, -code, -claimed, -done (sosed Dusk): the device the identity leaves (web
// screens/Departure.tsx, depth/ink move.ts MoveOut). What cannot be undone first, the PIN, then nine
// characters to type elsewhere with the time they live; once somebody typed them, who asked and the
// four check characters, and only "Yes, it's me" moves anything. Keys and routes: depth/core/
// transfer_move.ts; the screen's rules: depth/core/move_flow.ts (the same as the web's and the terminal's).
// The same testids as the web's: move-pin, move-go, move-code, move-label, move-check, move-yes, move-no,
// move-stop, move-ending, move-done, move-exit, error.
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { Answer, Client } from "@sdk/client.ts";
import { departureAsking, departureStep, endingOf, initialOf, secondsLeft, seenWords } from "@sdk/move_flow.ts";
import { canOpen, pinRefusal } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import { Departure as Leaving, type MoveState } from "@sdk/transfer_move.ts";
import { failedLine, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { check, close, codeBox, flag, stopSquare, toStart } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { MOVE_POLL_MS, MoveBar, MoveSheet, Shown, useEvery } from "./move-parts";
import { pinLine } from "./pin-line";
import { Cells } from "./register-parts";

const refusalOf = (a: Answer) => {
  const error = (a.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
  return pinLine(pinRefusal({ code: error?.code, status: a.status, attemptsLeft: error?.attempts_left, retryAfter: a.retryAfter ?? undefined }),
    say("app.move.refused", { status: a.status }));
};

export function Departure({ client, onBack, onGone }: { client: Client; onBack: () => void; onGone: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Leaving | null>(null);
  const [state, setState] = useState<MoveState>("waiting");
  const [left, setLeft] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const field = useId();
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 0); return () => clearTimeout(t); }, []);

  useEvery(MOVE_POLL_MS, () => out?.state().then((next) => {
    const step = departureStep(next);
    if (step.kill) void out.reject().catch(() => undefined);
    setState(next);
  }).catch((e: Error) => setError(failedLine(e))), !!out && departureAsking(state) && !busy);

  useEffect(() => {
    if (!out || state !== "waiting") return;
    const end = Date.now() + out.expiresIn * 1000;
    const tick = () => setLeft(secondsLeft(end, Date.now()));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [out, state]);

  async function open() {
    if (!canOpen(pin, busy)) { input.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try {
      const opened = await Leaving.open(client, await client.pinProof(pin));
      // The proof is made; the PIN has no further use here (depth/ink move.ts, review panel 2026-09-26 F23).
      setPin("");
      if (opened instanceof Leaving) return setOut(opened);
      setError(refusalOf(opened));
    } catch (e) {
      setError(failedLine(e));
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
        // Refused — decided or run out while the person read — the node says which on the next ask.
        if (answer.status !== 200) return setError(say("app.move.refused", { status: answer.status }));
        setState("approved");
      } else {
        await out.reject();
        setState("rejected");
      }
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }

  const ending = endingOf(state);
  const errorBox = error && <div data-testid="error"><p className="gate-error mv-error" role="alert"><Icon d={flag} /><span>{error}</span></p></div>;
  const bar = <MoveBar title={say("app.move.out_title")} onBack={state === "approved" ? undefined : onBack} />;
  const view = (() => {
    if (state === "approved") {
      return (
        <MoveSheet className="mv-center" foot={<button type="button" className="cta cta-primary" onClick={onGone} data-testid="move-exit"><Icon d={toStart} /><span>{say("app.move.to_start")}</span></button>}>
          <span className="mv-circle"><Icon d={check} /></span>
          <h1>{say("app.move.done_title")}</h1>
          <p className="mv-note" data-testid="move-done">{say("app.move.done_body")}</p>
        </MoveSheet>
      );
    }
    if (ending) {
      return (
        <MoveSheet foot={<button type="button" className="cta cta-quiet" onClick={onBack} data-testid="move-back-end"><span>{say("common.back")}</span></button>}>
          <p className="mv-note" data-testid="move-ending">{say(ending)}</p>
          {errorBox}
        </MoveSheet>
      );
    }
    if (!out) {
      return (
        <form className="mv-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void open(); }}>
          <MoveSheet foot={
            <button type="submit" className="cta cta-primary" aria-disabled={!canOpen(pin, busy) || undefined} aria-busy={busy || undefined} data-testid="move-go">
              <Icon d={codeBox} /><span>{say("app.move.get_code")}</span>
            </button>
          }>
            {/* What cannot be undone is said on the screen, before the PIN (§8.2). */}
            <div className="mv-warn" data-testid="move-price">
              <Icon d={flag} />
              <div><p className="mv-warn-title">{say("app.move.undone_title")}</p><p>{say("app.move.undone_body")}</p></div>
            </div>
            <div className="reg-field mv-pin">
              <label htmlFor={field}>{say("app.move.current_pin")}</label>
              <Cells id={field} text={say("web.ui.pinName")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))}
                onPaste={(e) => { e.preventDefault(); setPin(pinDigits(e.clipboardData.getData("text"))); }} inputRef={(n) => { input.current = n; }} testid="move-pin" />
            </div>
            {errorBox}
          </MoveSheet>
        </form>
      );
    }
    if (state === "claimed" && out.claimant) {
      const seen = seenWords(out.seenAt, Date.now());
      return (
        <MoveSheet foot={
          <>
            <button type="button" className="cta cta-primary" aria-disabled={busy || undefined} onClick={() => void decide(true)} data-testid="move-yes"><Icon d={check} /><span>{say("app.move.yes")}</span></button>
            <button type="button" className="cta cta-quiet" aria-disabled={busy || undefined} onClick={() => void decide(false)} data-testid="move-no"><Icon d={close} /><span>{say("app.move.no")}</span></button>
          </>
        }>
          <h1>{say("app.move.asks")}</h1>
          <p className="reg-sub mv-sub">{say("app.move.asks_sub")}</p>
          <div className="mv-who">
            <span className="mv-avatar" aria-hidden="true">{initialOf(out.claimant.label)}</span>
            <div><p className="mv-who-name" data-testid="move-label">{out.claimant.label}</p><p className="mv-who-when">{say(seen.key, seen.values)}</p></div>
          </div>
          <Shown chars={[...out.check]} columns={4} testid="move-check" />
          {errorBox}
        </MoveSheet>
      );
    }
    const minutes = Math.floor(left / 60), seconds = left % 60;
    // The arc is the part of the two minutes already gone (the sheet: a short arc at 1:52 left).
    const share = out.expiresIn > 0 ? 1 - left / out.expiresIn : 0;
    return (
      <MoveSheet foot={<button type="button" className="cta cta-quiet" aria-disabled={busy || undefined} onClick={() => void decide(false)} data-testid="move-stop"><Icon d={stopSquare} /><span>{say("app.move.stop")}</span></button>}>
        <h1 className="mv-code-title">{say("app.move.type_there")}</h1>
        <Shown chars={[...out.groups.join("")]} columns={3} testid="move-code" />
        <div className="mv-life">
          <span className="mv-ring" style={{ ["--left" as string]: share }} aria-hidden="true">
            <svg viewBox="0 0 44 44"><circle className="track" cx="22" cy="22" r="20" /><circle className="arc" cx="22" cy="22" r="20" pathLength="100" /></svg>
            <span>{Math.ceil(left / 60)}</span>
          </span>
          <p data-testid="move-life">{say("app.move.lives", { m: minutes, s: seconds })}</p>
        </div>
        {errorBox}
      </MoveSheet>
    );
  })();
  return (
    <Screen name="departure" title={label("app.move.out_title")} className="mv" data-state={out ? state : "start"}>
      {bar}
      {view}
    </Screen>
  );
}
