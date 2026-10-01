// The PIN after a reload (screen 12 of the storefronts, its first state): the
// device remembers an identity, the PIN opens it — through the node, which
// counts the misses and says how many are left (chat spec §8.2). The way out
// of a lock, and of a seal that does not open, is the paper code (V2).

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { forget, PinRefused, type Record_, unlockAfterReload } from "../vault.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";

// The node's refusal as one line, in the terminal's words (depth/ink/locales/
// ru.json pin.*, verbatim). 401 is a session the tenth miss froze — the guard
// answers before the PIN is checked — and reads as the lock; 429 is "too
// soon", the PIN was not checked, so no attempts are named (verifier of W1c).
function pinLine(e: PinRefused): string {
  if (e.code === "pin_mismatch") return say("pin.mismatch", { n: e.attemptsLeft ?? "?" });
  if (e.code === "pin_locked" || e.code === "unauthorized" || e.code === "status_401") return say("pin.locked");
  if (e.code === "rate_limited") return say("pin.wait", { n: e.retryAfter ?? "?" });
  return e.message;
}

export function Unlock({ record, onDone, onForget, onRestore }: { record: Record_; onDone: (client: Client, longKey: CryptoKey, wrapSame: boolean) => void; onForget: () => void; onRestore: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const { client, longKey, wrapSame } = await unlockAfterReload(record, pin);
      onDone(client, longKey, wrapSame);
    } catch (e) {
      if (e instanceof PinRefused) {
        setError(pinLine(e));
      } else {
        // The node gave its share, and the seal on the disk did not open with
        // it (WebCrypto's OperationError carries no words): only the paper
        // code gets back. The line is the lock's own until chat_RU.md says
        // one for this case (owner.md, 27.09.2026).
        setError(say("pin.locked"));
      }
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen unlock" data-screen="unlock">
      <HeaderScreen title={say("reg.pin")} />
      <div className="ui-info-row"><Info label={say("reg.pin")} data-testid="unlock-info"><p>{say("web.unlock.remembers")}</p></Info></div>
      <label>
        {say("reg.pin")}
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" data-testid="unlock-pin" autoFocus />
      </label>
      {error && <p className="error" data-testid="error">{error}</p>}
      <Button type="button" kind="primary" icon="key" className="ui-wide ui-foot" aria-label={busy ? say("web.unlock.asking") : say("inbox.enter")} aria-busy={busy} disabled={pin.length !== 6 || busy} onClick={unlock} data-testid="unlock" />
      {error && <Button type="button" icon="code" className="ui-wide" aria-label={say("web.unlock.restore")} onClick={onRestore} data-testid="unlock-restore" />}
      <Button type="button" icon="forget" className="ui-wide" aria-label={say("web.unlock.forget")} onClick={async () => { await forget(); onForget(); }} data-testid="forget" />
    </main>
  );
}
