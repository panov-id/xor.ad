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
import { CodeField } from "../ui/CodeField.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { PinField } from "../ui/Field.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import { Actions } from "../ui/Links.tsx";
import { Notice } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";

export function Restore({ onDone, onBack }: { onDone: (client: Client, longKey: CryptoKey) => void; onBack: () => void }) {
  // The paper code as four boxes of four (CodeField); a whole code typed or
  // pasted into any of them is laid out over all.
  const [code, setCode] = useState<string[]>(["", "", "", ""]);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = readPaperText(code.join(""));
  const codeOk = clean.length === 16;
  const pinOk = /^\d{6}$/.test(pin) && pin === again;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const result = await raiseAndKeep(code.join(" "), pin);
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

  const typedSome = code.some((group) => group !== "");
  return (
    <Screen name="restore" title={say("restore.title")} header={<HeaderScreen title={say("restore.title")} />}>
      <div className="ui-info-row"><Info label={say("web.info.code")} data-testid="restore-info"><p>{say("restore.intro")}</p></Info></div>
      <div data-testid="restore-code"><CodeField value={code} onChange={setCode} /></div>
      {typedSome && !codeOk && <Notice>{say("restore.bad")}</Notice>}
      <div className="ui-info-row"><Info label={say("web.info.pin")} data-testid="restore-pin-info"><p>{say("restore.newPinPrice")}</p></Info></div>
      <PinField label={say("web.pin.new")} value={pin} onChange={setPin} data-testid="restore-pin" />
      <PinField label={say("web.pin.newAgain")} value={again} onChange={setAgain}
        error={pin.length === 6 && again.length === 6 && pin !== again ? say("reg.pinMismatch") : undefined} data-testid="restore-pin-again" />
      {error && <div data-testid="error"><ErrorLine>{error}</ErrorLine></div>}
      <Actions>
        <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="restore-back" />
        <Button type="button" kind="primary" icon="key" className="ui-wide" aria-label={say("restore.go")} aria-busy={busy} disabled={!codeOk || !pinOk || busy} onClick={() => void go()} data-testid="restore-go" />
      </Actions>
    </Screen>
  );
}
