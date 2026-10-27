// w2_locked (sosed Dusk, mobile_390_w2_locked): after five minutes without input the page is this and nothing else
// (web screens/Locked.tsx; no name, no count, no mark of anything). The core refuses every signed call until the PIN's
// proof opens it (Client.unlock → POST /vault/share); the node counts the attempts, so a refusal says what it says
// at start-up. Opened, the page goes on where it was. Rules: depth/core/pin_gate.ts.
// The same testids as the web's: lock-pin, locked-timer, error; the PIN's own pad, the sixth digit asks (no lock-go).
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { canOpen, clockText, pinRefusal, secondsLeft, untilOf } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import { HeldKey } from "@sdk/transfer.ts";
import { failedLine, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { pinLine } from "./pin-line";
import { Cells, PinPad } from "./register-parts";
import { pressed as padPressed } from "./pin-flow";

export function Locked({ client, onUnlocked }: { client: Client; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  // "Too soon" also says in how many seconds; that end is the only one this screen knows.
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement | null>(null);
  const field = useId();
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 0); return () => clearTimeout(t); }, []);
  // the sixth digit asks, as on the PIN screen (sheet locked: the pad, no «enter»)
  useEffect(() => { if (pin.length === PIN_LENGTH && !busy) void open(); }, [pin]);
  useEffect(() => {
    if (until === null) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) setUntil(null);
    }, 1000);
    return () => clearInterval(t);
  }, [until]);

  async function open() {
    if (!canOpen(pin, busy)) { input.current?.focus(); return; }
    setBusy(true);
    setRefused(null);
    setUntil(null);
    const typed = pin;
    // The PIN leaves the screen with its proof.
    setPin("");
    try {
      const r = await client.unlock(typed, { hold: HeldKey.hold });
      if (r.ok) return onUnlocked();
      const error = (r.answer.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
      const refusal = pinRefusal({ code: error?.code, status: r.answer.status, attemptsLeft: error?.attempts_left, retryAfter: r.answer.retryAfter });
      if (refusal.kind === "wait") {
        const end = untilOf(Date.now(), refusal.seconds);
        if (end !== null) { setNow(Date.now()); setUntil(end); }
      }
      setRefused(pinLine(refusal, `${r.answer.status}`));
    } catch (e) {
      setRefused(failedLine(e));
    }
    setBusy(false);
    input.current?.focus();
  }

  // the prototype's locked (docs/newdesign/proto/locked.html): one panel, the lock, two lines, six dots, the pad
  return (
    <main className="k-screen" data-screen="locked">
      <form className="k-col" onSubmit={(e: FormEvent) => { e.preventDefault(); void open(); }}>
        <section className="k-panel k-grow k-reg">
          <NdIcon name="lock" className="k-big-icon k-mid" />
          <div className="k-stack k-centre-text"><h1 className="k-title k-title-big">{say("app.locked.title")}</h1><p className="k-sub">{say("app.locked.sub")}</p></div>
          <div className="k-pin">
            <label htmlFor={field} className="k-sub">{say("reg.pin")}</label>
            <Cells id={field} text={say("web.ui.pinName")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))}
              onPaste={(e) => { e.preventDefault(); setPin(pinDigits(e.clipboardData.getData("text"))); }} inputRef={(n) => { input.current = n; }} testid="lock-pin" />
          </div>
          {refused && <div data-testid="error"><p className="k-note" data-tone="error" role="alert"><NdIcon name="alert" /><span>{refused}</span></p></div>}
          {until !== null && <p className="k-title k-mid" role="timer" data-testid="locked-timer">{clockText(secondsLeft(until, now))}</p>}
          {busy && <p className="k-sub k-mid" role="status" data-testid="locked-busy">{say("web.unlock.asking")}</p>}
          <PinPad onKey={(k) => setPin((p) => padPressed(p, k))} disabled={busy} />
        </section>
      </form>
    </main>
  );
}
