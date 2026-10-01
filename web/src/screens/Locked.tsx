// The lock (W13-WL; the storefronts' screen 12, its second state): after five
// minutes without input the page is one line — «ПИН ›» — with no name, no
// count, no mark of anything; the core refuses every signed call until the
// PIN's proof opens it (Client.unlock → POST /vault/share). The node counts
// the attempts, so a refusal says what it says at start-up: attempts left,
// entry closed until the paper code, or too soon. Opened, the page goes on
// where it was — no reload, no record read; the chat keys are made anew from
// the long key the seal gives back.

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { HeldKey } from "../../../depth/core/transfer.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";

export function Locked({ client, onUnlocked }: { client: Client; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  async function open() {
    if (pin.length !== 6 || busy) return;
    setBusy(true);
    setRefused(null);
    const typed = pin;
    // The PIN leaves the screen with its proof.
    setPin("");
    try {
      const r = await client.unlock(typed, { hold: HeldKey.hold });
      if (r.ok) return onUnlocked();
      const error = (r.answer.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
      if (error?.code === "pin_mismatch") return setRefused(say("pin.mismatch", { n: error.attempts_left ?? "?" }));
      if (error?.code === "pin_locked" || r.answer.status === 401) return setRefused(say("pin.locked"));
      if (error?.code === "rate_limited") return setRefused(say("pin.wait", { n: r.answer.retryAfter ?? "?" }));
      setRefused(`${r.answer.status}`);
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen locked" data-screen="locked">
      <form onSubmit={(e) => { e.preventDefault(); void open(); }}>
        <label>
          {say("lock.prompt")}
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" data-testid="lock-pin" autoFocus />
        </label>
        {refused && <p className="error" data-testid="error">{refused}</p>}
        <Button type="submit" kind="primary" disabled={pin.length !== 6 || busy} data-testid="lock-go">
          {busy ? say("web.unlock.asking") : say("inbox.enter")}
        </Button>
      </form>
    </main>
  );
}
