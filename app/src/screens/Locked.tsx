// w2_locked (sosed Dusk, mobile_390_w2_locked): after five minutes without input the page is this and nothing else
// (web screens/Locked.tsx; no name, no count, no mark of anything). The core refuses every signed call until the PIN's
// proof opens it (Client.unlock → POST /vault/share); the node counts the attempts, so a refusal says what it says
// at start-up. Opened, the page goes on where it was. Rules: depth/core/pin_gate.ts.
// The same testids as the web's: lock-pin, locked-timer, error; the PIN's own pad, the sixth digit asks (no lock-go).
import { useEffect, useId, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { canOpen, clockText, pinRefusal, secondsLeft, untilOf } from "@sdk/pin_gate.ts";
import { PIN_LENGTH } from "@sdk/register.ts";
import { HeldKey } from "@sdk/transfer.ts";
import { failedLine, say } from "../i18n";
import { idleMs } from "../vault";
import { PinDoor } from "./pin-door";
import { pinLine } from "./pin-line";

export function Locked({ client, onUnlocked }: { client: Client; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [refusals, setRefusals] = useState(0);
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
      setRefusals((n) => n + 1);
    } catch (e) {
      setRefused(failedLine(e));
    }
    setBusy(false);
    input.current?.focus();
  }

  // docs/newdesign4 09 (SCREENS_spec §10): screen 06 as it is, the line grey with the clock, «Locked after N min away»
  // (N is this build's own idle time, vault.ts idleMs); a refusal says itself in the accent
  const line = refused ?? say("app.locked.away", { n: Math.max(1, Math.round(idleMs() / 60_000)) });
  return (
    <PinDoor screen="locked" line={line} tone={refused ? "error" : "quiet"} pin={pin} setPin={setPin} inputRef={(n) => { input.current = n; }} field={field}
      testid="lock-pin" disabled={busy} refusals={refusals}
      under={<>
        {until !== null && <p className="nd-h1 nd-mid" role="timer" data-testid="locked-timer">{clockText(secondsLeft(until, now))}</p>}
        {busy && <p className="nd-sub" role="status" data-testid="locked-busy">{say("web.unlock.asking")}</p>}
      </>} />
  );
}
