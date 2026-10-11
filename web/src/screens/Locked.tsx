// The lock (W13-WL; the storefronts' screen 12, its second state): after five
// minutes without input the page is one line — «ПИН ›» — with no name, no
// count, no mark of anything; the core refuses every signed call until the
// PIN's proof opens it (Client.unlock → POST /vault/share). The node counts
// the attempts, so a refusal says what it says at start-up: attempts left,
// entry closed until the paper code, or too soon. Opened, the page goes on
// where it was — no reload, no record read; the chat keys are made anew from
// the long key the seal gives back.

import { useEffect, useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { HeldKey } from "../../../depth/core/transfer.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { FormCard } from "../ui/FormCard.tsx";
import { PinField } from "../ui/Field.tsx";
import { Screen } from "../ui/Screen.tsx";
import { pinMismatch } from "../pinWords.ts";

export function Locked({ client, onUnlocked }: { client: Client; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  // When the node says "too soon" it also says in how many seconds; that end is
  // the only one this screen knows (the five-minute lock itself has none).
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= until) setUntil(null);
    }, 1000);
    return () => clearInterval(t);
  }, [until]);
  const left = until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
  const clock = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;

  async function open() {
    if (pin.length !== 6 || busy) return;
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
      // The same words as at start-up, with §8.2's second sentence on the last three (W14-WP; pinWords.ts).
      if (error?.code === "pin_mismatch") return setRefused(pinMismatch(error.attempts_left));
      if (error?.code === "pin_locked" || r.answer.status === 401) return setRefused(say("pin.locked"));
      if (error?.code === "rate_limited") {
        if (typeof r.answer.retryAfter === "number") { setNow(Date.now()); setUntil(Date.now() + r.answer.retryAfter * 1000); }
        return setRefused(say("pin.wait", { n: r.answer.retryAfter ?? "?" }));
      }
      setRefused(`${r.answer.status}`);
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen name="locked" title={say("lock.prompt")}>
      <form onSubmit={(e) => { e.preventDefault(); void open(); }}>
        <FormCard icon="key" error={refused}>
          <PinField label={say("lock.prompt")} value={pin} onChange={setPin} autoFocus data-testid="lock-pin" />
          {until !== null && <p className="ui-locked-timer" role="timer" data-testid="locked-timer">{clock}</p>}
        </FormCard>
        <Button type="submit" kind="primary" icon="key" className="ui-wide" aria-label={busy ? say("web.unlock.asking") : say("inbox.enter")} aria-busy={busy} disabled={pin.length !== 6 || busy} data-testid="lock-go" />
      </form>
    </Screen>
  );
}
