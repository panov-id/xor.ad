// w2_unlock (sosed Dusk, mobile_390_w2_unlock): a device that remembers an identity asks the PIN (web
// screens/Unlock.tsx, its rules are the SDK's: depth/core/pin_gate.ts, unlock.ts). The PIN goes to the node, which
// counts the misses and says how many are left; the refusal is the coral box. Ten misses close entry, and the way
// out of that, and of a seal that does not open, is the paper code.
// The same testids as the web's: unlock-pin, unlock, unlock-restore, forget, error.
// The sheet greets by name ("Welcome back, Alex"); the record keeps none (the web's Locked draws no name either:
// nothing of the person on a screen before the PIN), so the greeting is the words alone.
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import type { Record_ } from "@sdk/enroll.ts";
import { canOpen, pinRefusal } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import { label, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { captions, flag, home, key } from "../shell/icons";
import { Screen } from "../shell/Screen";
import { forget, unlockAfterReload } from "../vault";
import { pinLine } from "./pin-line";
import { Cells } from "./register-parts";

export function Unlock({ record, onDone, onForget, onRestore }: {
  record: Record_; onDone: (client: Client, wrapSame: boolean) => void; onForget: () => void; onRestore: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Entry closed until the paper code: the node refuses every PIN, so the button says so by not going.
  const [closed, setClosed] = useState(false);
  const [sure, setSure] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  const field = useId();
  // The screen's own focus goes to the title (Screen); the PIN takes it after that, as the sheet's caret ring shows.
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 0); return () => clearTimeout(t); }, []);

  async function unlock() {
    if (!canOpen(pin, busy, closed)) { input.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await unlockAfterReload(record, pin);
      if (r.ok) return onDone(r.opened.client, r.opened.wrapSame);
      const refusal = pinRefusal({ code: r.code, attemptsLeft: r.attemptsLeft, retryAfter: r.retryAfter });
      setClosed(refusal.kind === "locked");
      setError(pinLine(refusal, say("web.vault.pinWrong")));
    } catch {
      // The node gave its share and the seal on the disk did not open with it (WebCrypto's error has no words):
      // only the paper code gets back, as the web says.
      setError(say("pin.locked"));
    }
    setPin("");
    setBusy(false);
    input.current?.focus();
  }

  return (
    <Screen name="unlock" title={say("reg.pin")} className="gate">
      <form className="gate-body" onSubmit={(e: FormEvent) => { e.preventDefault(); void unlock(); }}>
        <span className="reg-mark"><Icon d={home} /></span>
        <h1>{say("app.unlock.title")}</h1>
        <p className="reg-sub">{say("app.unlock.sub")}</p>
        <div className="reg-field">
          <label htmlFor={field}>{say("reg.pin")}</label>
          <Cells id={field} text={say("web.ui.pinName")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))}
            onPaste={(e) => { e.preventDefault(); setPin(pinDigits(e.clipboardData.getData("text"))); }} inputRef={(n) => { input.current = n; }} testid="unlock-pin" />
        </div>
        {error && <div data-testid="error"><p className="gate-error" role="alert"><Icon d={flag} /><span>{error}</span></p></div>}
        {/* One tap wipes the identity off the device and only the paper code brings it back, so the first tap only
            asks; the second, on the same spot, forgets. */}
        <button type="button" className="link gate-forget" data-testid={sure ? "forget-sure" : "forget"} aria-live="polite"
          onClick={async () => { if (!sure) { setSure(true); return; } await forget(); onForget(); }}>{say(sure ? "app.unlock.forget_sure" : "web.unlock.forget")}</button>
        <div className="gate-foot">
          <button type="submit" className="cta cta-primary" aria-disabled={busy || closed ? true : undefined} aria-busy={busy || undefined} data-testid="unlock">
            <Icon d={key} /><span>{busy ? say("web.unlock.asking") : label("inbox.enter")}</span>
          </button>
          <button type="button" className="cta cta-quiet" onClick={onRestore} data-testid="unlock-restore">
            <Icon d={captions} /><span>{say("app.unlock.paper")}</span>
          </button>
        </div>
      </form>
    </Screen>
  );
}
