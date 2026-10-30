// w2_departure-start, -code, -claimed, -done (sosed Dusk): the device the identity leaves (web
// screens/Departure.tsx, depth/ink move.ts MoveOut). What cannot be undone first, the PIN, then nine
// characters to type elsewhere with the time they live; once somebody typed them, who asked and the
// four check characters, and only "Yes, it's me" moves anything. Keys and routes: depth/core/
// transfer_move.ts; the screen's rules: depth/core/move_flow.ts (the same as the web's and the terminal's).
// The same testids as the web's: move-pin, move-go, move-code, move-label, move-check, move-yes, move-no,
// move-stop, move-ending, move-done, move-exit, error.
import { type FormEvent, useContext, useEffect, useId, useRef, useState } from "react";
import type { Answer, Client } from "@sdk/client.ts";
import { departureAsking, departureStep, endingOf, initialOf, secondsLeft, seenWords } from "@sdk/move_flow.ts";
import { canOpen, pinRefusal } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import { Departure as Leaving, type MoveState } from "@sdk/transfer_move.ts";
import { failedLine, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { check, close, codeBox, flag, stopSquare, toStart } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { Rail } from "../shell/TabBar";
import { SplitFrame } from "./Away";
import { InPane } from "./me/parts";
import { PinPad } from "./register-parts";
import { pressed as padPressed } from "./pin-flow";
import { NdIcon } from "../shell/NdIcon";
import { useMinWidth } from "../shell/useMinWidth";
import { MOVE_POLL_MS, MoveBar, MoveSheet, Shown, useEvery } from "./move-parts";
import { pinLine } from "./pin-line";
import { Cells } from "./register-parts";

const refusalOf = (a: Answer) => {
  const error = (a.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
  return pinLine(pinRefusal({ code: error?.code, status: a.status, attemptsLeft: error?.attempts_left, retryAfter: a.retryAfter ?? undefined }),
    say("app.move.refused", { status: a.status }));
};

// desktop_1440 6-me departure-done.svg: the move is over, the frame of away.svg (no rail, Me gone): the big check,
// the brand, the words; the small check and the way to the start under it.
export function DepartureDone({ onGone }: { onGone: () => void }) {
  return (
    <SplitFrame name="departure" title={label("app.move.out_title")} mark={<Icon d={check} />} small={<Icon d={check} />}
      words={<><h1>{say("app.move.done_title")}</h1><p className="k-note" data-testid="move-done">{say("app.move.done_body")}</p></>}
      facts={null} foot={<button type="button" className="cta cta-primary" onClick={onGone} data-testid="move-exit"><Icon d={toStart} /><span>{say("app.move.to_start")}</span></button>} />
  );
}

// desktop_1440 6-me departure-1..3: in Me's right pane (no second rail); once approved, Me hands the whole screen to
// DepartureDone (onApproved), as the sheet drops Me and the rail.
export function Departure({ client, onBack, onGone, onApproved }: { client: Client; onBack: () => void; onGone: () => void; onApproved?: () => void }) {
  const pane = useContext(InPane);
  const desk = useMinWidth("--bp-desktop");
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

  // departure-1 in the pane: the pad, no button; the sixth digit asks for the code by itself (as unlock.svg)
  useEffect(() => { if (pane && !out && canOpen(pin, busy)) void open(); }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (state === "approved") onApproved?.(); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const ending = endingOf(state);
  const errorBox = error && <div data-testid="error"><p className="k-note k-error" role="alert"><Icon d={flag} /><span>{error}</span></p></div>;
  const bar = <MoveBar title={say("app.move.out_title")} onBack={state === "approved" ? undefined : onBack} />;
  const view = (() => {
    if (state === "approved") {
      if (desk) return null;
      return (
        <MoveSheet className="k-centre-col" foot={<button type="button" className="cta cta-primary" onClick={onGone} data-testid="move-exit"><Icon d={toStart} /><span>{say("app.move.to_start")}</span></button>}>
          <span className="k-mark-110"><Icon d={check} /></span>
          <h1>{say("app.move.done_title")}</h1>
          <p className="k-note" data-testid="move-done">{say("app.move.done_body")}</p>
        </MoveSheet>
      );
    }
    if (ending) {
      return (
        <MoveSheet foot={<button type="button" className="cta cta-quiet" onClick={onBack} data-testid="move-back-end"><span>{say("common.back")}</span></button>}>
          <p className="k-note" data-testid="move-ending">{say(ending)}</p>
          {errorBox}
        </MoveSheet>
      );
    }
    if (!out) {
      return (
        <form className="k-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void open(); }}>
          <MoveSheet foot={pane ? undefined :
            <button type="submit" className="cta cta-primary" aria-disabled={!canOpen(pin, busy) || undefined} aria-busy={busy || undefined} data-testid="move-go">
              <Icon d={codeBox} /><span>{say("app.move.get_code")}</span>
            </button>
          }>
            {pane && <NdIcon name="move" className="k-big-icon k-mid" />}
            {/* departure-1.svg (owner 28.10): what moves to the new device, three tiles */}
            {pane && <ul className="k-hub" data-hub="move" data-testid="move-what">
              <li className="k-hub-li"><span className="k-hub-tile" data-small=""><span className="k-badge" data-c="1" aria-hidden="true"><NdIcon name="phrase" /></span><span className="k-row-name">{say("app.move.what_phrases")}</span></span></li>
              <li className="k-hub-li"><span className="k-hub-tile" data-small=""><span className="k-badge" data-c="4" aria-hidden="true"><NdIcon name="talks" /></span><span className="k-row-name">{say("app.move.what_talks")}</span></span></li>
              <li className="k-hub-li"><span className="k-hub-tile" data-small=""><span className="k-badge" data-c="5" aria-hidden="true"><NdIcon name="tables" /></span><span className="k-row-name">{say("app.move.what_tables")}</span></span></li>
            </ul>}
            {/* What cannot be undone is said on the screen, before the PIN (§8.2). */}
            <div className="k-note k-error" data-testid="move-price">
              <Icon d={flag} />
              <div><p className="k-row-name">{say("app.move.undone_title")}</p><p>{say("app.move.undone_body")}</p></div>
            </div>
            <div className="reg-field k-pin">
              <label htmlFor={field}>{say("app.move.current_pin")}</label>
              <Cells id={field} text={say("web.ui.pinName")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))}
                onPaste={(e) => { e.preventDefault(); setPin(pinDigits(e.clipboardData.getData("text"))); }} inputRef={(n) => { input.current = n; }} testid="move-pin" />
            </div>
            {errorBox}
            {pane && <PinPad onKey={(k) => setPin((p) => padPressed(p, k))} disabled={busy} />}
          </MoveSheet>
        </form>
      );
    }
    if (state === "claimed" && out.claimant) {
      const seen = seenWords(out.seenAt, Date.now());
      return (
        <MoveSheet foot={
          // departure-3.svg in the pane: a round ✕ and a wide ✓ in one row
          pane ? (
            <div className="k-row">
              <button type="button" className="k-icon-btn" aria-label={say("app.move.no")} aria-disabled={busy || undefined} onClick={() => void decide(false)} data-testid="move-no"><Icon d={close} /></button>
              <button type="button" className="cta cta-primary" style={{ flex: 1 }} aria-disabled={busy || undefined} onClick={() => void decide(true)} data-testid="move-yes"><Icon d={check} /><span>{say("app.move.yes")}</span></button>
            </div>
          ) : <>
            <button type="button" className="cta cta-primary" aria-disabled={busy || undefined} onClick={() => void decide(true)} data-testid="move-yes"><Icon d={check} /><span>{say("app.move.yes")}</span></button>
            <button type="button" className="cta cta-quiet" aria-disabled={busy || undefined} onClick={() => void decide(false)} data-testid="move-no"><Icon d={close} /><span>{say("app.move.no")}</span></button>
          </>
        }>
          <h1>{say("app.move.asks")}</h1>
          <p className="k-sub">{say("app.move.asks_sub")}</p>
          <div className="k-row">
            <span className="k-ava k-ava-big" aria-hidden="true">{initialOf(out.claimant.label)}</span>
            <div><p className="k-row-name" data-testid="move-label">{out.claimant.label}</p><p className="k-meta">{say(seen.key, seen.values)}</p></div>
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
        {/* departure-2.svg in the pane: the device and the words on top, the code's three groups in a row, the ring below */}
        {pane ? (
          <div className="k-row"><NdIcon name="device" /><div><h1 className="k-row-name">{say("app.move.type_there")}</h1>
            <p className="k-meta" data-testid="move-life">{say("app.move.lives", { m: minutes, s: seconds })}</p></div></div>
        ) : <h1 className="k-title k-title-big">{say("app.move.type_there")}</h1>}
        {pane ? <Shown chars={out.groups} columns={3} testid="move-code" /> : <Shown chars={[...out.groups.join("")]} columns={3} testid="move-code" />}
        <div className={pane ? "k-row k-mid" : "k-row"} style={pane ? { marginTop: "auto" } : undefined}>
          <span className="k-ring" style={{ ["--left" as string]: share }} aria-hidden="true">
            <span>{Math.ceil(left / 60)}</span>
          </span>
          {!pane && <p data-testid="move-life">{say("app.move.lives", { m: minutes, s: seconds })}</p>}
        </div>
        {errorBox}
      </MoveSheet>
    );
  })();
  if (state === "approved" && desk) return pane ? null : <DepartureDone onGone={onGone} />;
  return (
    <Screen name="departure" title={label("app.move.out_title")} className="k-screen" data-state={out ? state : "start"}>
      <div className="k-col">
      {bar}
      {view}
      {!pane && <Rail active="me" />}
      </div>
    </Screen>
  );
}
