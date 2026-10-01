// A clean device raised by the paper code (W6; depth/ink restore + PinSet):
// sixteen characters from the paper, then a new PIN twice — the claim leaves
// a first-PIN grant — and the identity is here, sealed in the vault under the
// new PIN and the node's share. Words verbatim from depth/ink/locales/ru.json.

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { readPaperText } from "../../../depth/core/paper.ts";
import { say } from "../api/me.ts";
import { raiseAndKeep } from "../vault.ts";
import { Button } from "../ui/Button.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";

export function Restore({ onDone, onBack }: { onDone: (client: Client, longKey: CryptoKey) => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = readPaperText(code);
  const codeOk = clean.length === 16;
  const pinOk = /^\d{6}$/.test(pin) && pin === again;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const result = await raiseAndKeep(code, pin);
      if (!("client" in result)) {
        const o = result.outcome as { ok: false; reason?: string; retryAfter?: number; status?: number };
        if (o.reason === "no_match") return setError(say("restore.noMatch"));
        if (o.reason === "rate_limited") return setError(say("restore.wait", { n: String(o.retryAfter ?? "?") }));
        return setError(say("restore.refused", { status: String(o.status ?? o.reason ?? "?") }));
      }
      onDone(result.client, result.longKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen restore" data-screen="restore">
      <HeaderScreen title={say("restore.title")} />
      <div className="ui-info-row"><Info label={say("restore.title")} data-testid="restore-info"><p>{say("restore.intro")}</p></Info></div>
      <label>
        {say("restore.code")}
        <input value={code} onChange={(e) => setCode(e.target.value)} data-testid="restore-code" autoComplete="off" />
        {code !== "" && !codeOk && <span className="warn">{say("restore.bad")}</span>}
      </label>
      <div className="ui-info-row"><Info label={say("pin.next")} data-testid="restore-pin-info"><p>{say("restore.newPinPrice")}</p></Info></div>
      <label>
        {say("pin.next")}
        <input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="restore-pin" />
      </label>
      <label>
        {say("pin.again")}
        <input type="password" inputMode="numeric" value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="restore-pin-again" />
      </label>
      {pin.length === 6 && again.length === 6 && pin !== again && <p className="error">{say("reg.pinMismatch")}</p>}
      {error && <p className="error" data-testid="error">{error}</p>}
      <Button type="button" kind="primary" icon="key" className="ui-wide" aria-label={say("restore.go")} aria-busy={busy} disabled={!codeOk || !pinOk || busy} onClick={() => void go()} data-testid="restore-go" />
      <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="restore-back" />
    </main>
  );
}
