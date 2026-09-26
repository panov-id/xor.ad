// The PIN after a reload (screen 12 of the storefronts, its first state): the
// device remembers an identity, the PIN opens it — through the node, which
// counts the misses and says how many are left (chat spec §8.2). The way out
// of a lock is the paper code, which this skeleton does not draw yet.

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { forget, PinRefused, type Record_, unlockAfterReload } from "../vault.ts";

// The node's refusal as one line, in the terminal's words (depth/ink/locales/
// ru.json pin.*, verbatim). 401 is a session the tenth miss froze — the guard
// answers before the PIN is checked — and reads as the lock; 429 is "too
// soon", the PIN was not checked, so no attempts are named (verifier of W1c).
function pinLine(e: PinRefused): string {
  if (e.code === "pin_mismatch") return `ПИН не подходит. Осталось попыток: ${e.attemptsLeft ?? "?"}`;
  if (e.code === "pin_locked" || e.code === "unauthorized" || e.code === "status_401") return "Вход закрыт до бумажного кода.";
  if (e.code === "rate_limited") return `Слишком рано после прошлой попытки. Ещё раз через ${e.retryAfter ?? "?"} с.`;
  return e.message;
}

export function Unlock({ record, onDone, onForget }: { record: Record_; onDone: (client: Client, longKey: CryptoKey, wrapSame: boolean) => void; onForget: () => void }) {
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
        setError((e as Error).message);
      }
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen unlock" data-screen="unlock">
      <header><h1>ПИН</h1></header>
      <p className="muted">Это устройство помнит вас. Введите ПИН, чтобы продолжить.</p>
      <label>
        ПИН
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" data-testid="unlock-pin" autoFocus />
      </label>
      {error && <p className="error" data-testid="error">{error}</p>}
      <button type="button" className="primary" disabled={pin.length !== 6 || busy} onClick={unlock} data-testid="unlock">
        {busy ? "спрашиваем узел…" : "открыть"}
      </button>
      <button type="button" onClick={async () => { await forget(); onForget(); }} data-testid="forget">
        это не я — забыть это устройство
      </button>
    </main>
  );
}
