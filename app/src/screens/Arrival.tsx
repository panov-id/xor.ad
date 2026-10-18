// w2_arrival-code, -check, -pin (sosed Dusk): the device the identity arrives at (web screens/Arrival.tsx
// and logic/useArrival.ts, depth/ink move.ts MoveIn). Nine characters from the old device, the four check
// characters to compare there while this one waits, and after "it is me" a first PIN, which seals the
// identity on this device as a raise by the paper code does (depth/web-platform/arrive_keep.ts).
// The same testids as the web's: arrive-code, arrive-go, arrive-back, arrive-check, arrive-pin,
// arrive-pin-again, arrive-keep, move-ending, error.
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { arrivalAsking, claimRefusal, deviceLabel, endingOf, MOVE_CODE_LENGTH, newPinReady, typedCode } from "@sdk/move_flow.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import type { MoveState } from "@sdk/transfer_move.ts";
import { failedLine, label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { arrowRight, check, flag, hand } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { type Arriving, claimArrival, keepArrived } from "../vault";
import { MOVE_POLL_MS, MoveBar, MoveSheet, Shown, useEvery } from "./move-parts";
import { Cells } from "./register-parts";

// What was typed, as the cells show it: the code's own characters, upper case, nine at most.
const codeChars = (typed: string): string => typed.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, MOVE_CODE_LENGTH);

export function Arrival({ onDone, onBack }: { onDone: (client: Client) => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [into, setInto] = useState<Arriving | null>(null);
  const [state, setState] = useState<MoveState>("claimed");
  const codeInput = useRef<HTMLInputElement | null>(null);
  const pinInput = useRef<HTMLInputElement | null>(null);
  const codeField = useId(), pinField = useId(), againField = useId();
  const { clean, complete } = typedCode(code);

  useEffect(() => { const t = setTimeout(() => codeInput.current?.focus(), 0); return () => clearTimeout(t); }, []);
  useEffect(() => { if (state === "approved") { const t = setTimeout(() => pinInput.current?.focus(), 0); return () => clearTimeout(t); } }, [state]);

  useEvery(MOVE_POLL_MS, () => into?.arrival.state().then(setState).catch((e: Error) => setError(failedLine(e))), !!into && arrivalAsking(state));

  async function claim() {
    if (!complete || busy) { codeInput.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try {
      const claimed = await claimArrival(clean, deviceLabel(navigator.userAgent, say("web.transfer.browser")));
      if ("arrival" in claimed) return setInto(claimed);
      const refusal = claimRefusal(claimed);
      setError(refusal ? say(refusal.key, refusal.values) : say("app.move.refused", { status: claimed.status }));
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    if (!into || !newPinReady(pin, again) || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { client } = await keepArrived(into, pin);
      onDone(client);
    } catch (e) {
      setError(failedLine(e));
      setBusy(false);
    }
  }

  const ending = endingOf(state);
  const errorBox = error && <div data-testid="error"><p className="gate-error mv-error" role="alert"><Icon d={flag} /><span>{error}</span></p></div>;
  const view = (() => {
    if (!into) {
      return (
        <form className="mv-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void claim(); }}>
          <MoveSheet foot={
            <button type="submit" className="cta cta-primary" aria-disabled={!complete || busy || undefined} aria-busy={busy || undefined} data-testid="arrive-go">
              <Icon d={arrowRight} /><span>{busy ? say("move.deriving") : say("app.move.next")}</span>
            </button>
          }>
            <h1>{say("app.move.code_title")}</h1>
            <p className="reg-sub mv-sub">{say("app.move.code_sub")}</p>
            <div className="mv-code-cells">
              <Cells id={codeField} text={say("move.code")} value={codeChars(code)} size={MOVE_CODE_LENGTH} onChange={(v) => setCode(codeChars(v))}
                onPaste={(e) => { e.preventDefault(); setCode(codeChars(e.clipboardData.getData("text"))); }} inputRef={(n) => { codeInput.current = n; }} testid="arrive-code" />
            </div>
            {errorBox}
          </MoveSheet>
        </form>
      );
    }
    if (ending) {
      return (
        <MoveSheet foot={<button type="button" className="cta cta-quiet" onClick={onBack} data-testid="arrive-back"><span>{say("common.back")}</span></button>}>
          <p className="mv-note" data-testid="move-ending">{say(ending)}</p>
          {errorBox}
        </MoveSheet>
      );
    }
    if (state === "approved") {
      const differ = pin.length === PIN_LENGTH && again.length === PIN_LENGTH && pin !== again;
      return (
        <form className="mv-form" onSubmit={(e: FormEvent) => { e.preventDefault(); void keep(); }}>
          <MoveSheet foot={
            <button type="submit" className="cta cta-primary" aria-disabled={!newPinReady(pin, again) || busy || undefined} aria-busy={busy || undefined} data-testid="arrive-keep">
              <Icon d={check} /><span>{say("app.move.done")}</span>
            </button>
          }>
            <p className="mv-ok"><Icon d={hand} /><span>{say("app.move.confirmed")}</span></p>
            <div className="reg-field mv-pin">
              <label htmlFor={pinField}>{say("app.move.new_pin")}</label>
              <Cells id={pinField} text={say("app.move.new_pin")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))} inputRef={(n) => { pinInput.current = n; }} testid="arrive-pin" />
            </div>
            <div className="reg-field mv-pin">
              <label htmlFor={againField}>{say("app.move.repeat_pin")}</label>
              <Cells id={againField} text={say("app.move.repeat_pin")} value={again} size={PIN_LENGTH} secret onChange={(v) => setAgain(pinDigits(v))} invalid={differ} testid="arrive-pin-again" />
              {differ && <p className="reg-error">{say("reg.pinMismatch")}</p>}
            </div>
            {errorBox}
          </MoveSheet>
        </form>
      );
    }
    return (
      <MoveSheet>
        <h1>{say("app.move.check_title")}</h1>
        <p className="reg-sub mv-sub">{say("app.move.check_sub")}</p>
        <Shown chars={[...into.arrival.check]} columns={4} testid="arrive-check" />
        <span className="mv-wait" aria-hidden="true" />
        <p className="mv-waiting" role="status">{say("app.move.waiting")}</p>
        {errorBox}
      </MoveSheet>
    );
  })();
  return (
    <Screen name="arrival" title={label("app.move.in_title")} className="mv" data-state={!into ? "code" : state}>
      <MoveBar title={say("app.move.in_title")} onBack={state === "approved" ? undefined : onBack} />
      {view}
    </Screen>
  );
}
