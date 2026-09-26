// The PIN after a reload (screen 12 of the storefronts, its first state): the
// device remembers an identity, the PIN opens it — through the node, which
// counts the misses and says how many are left (chat spec §8.2). The way out
// of a lock is the paper code, which this skeleton does not draw yet.

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { forget, PinRefused, type Record_, unlockAfterReload } from "../vault.ts";

export function Unlock({ record, onDone, onForget }: { record: Record_; onDone: (client: Client, longKey: CryptoKey) => void; onForget: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const { client, longKey } = await unlockAfterReload(record, pin);
      onDone(client, longKey);
    } catch (e) {
      if (e instanceof PinRefused) {
        setError(e.attemptsLeft !== undefined ? `${e.message} — осталось попыток: ${e.attemptsLeft}` : e.message);
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
