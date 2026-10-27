// w2_unlock (sosed Dusk, mobile_390_w2_unlock): a device that remembers an identity asks the PIN (web
// screens/Unlock.tsx, its rules are the SDK's: depth/core/pin_gate.ts, unlock.ts). The PIN goes to the node, which
// counts the misses and says how many are left; the refusal is the coral box. Ten misses close entry, and the way
// out of that, and of a seal that does not open, is the paper code.
// The same testids as the web's: unlock-pin, unlock-restore, forget, error. New design (NEWDESIGN_PLAN §7 step 5; sheets
// unlock, unlock-error, forget-confirm): the PIN's own pad, the sixth digit asks the node by itself; «forget» opens a
// screen of its own with the price and two buttons (forget-cancel, forget-sure), never a second tap on the same spot.
// The sheet greets by name ("Welcome back, Alex"); the record keeps none (the web's Locked draws no name either:
// nothing of the person on a screen before the PIN), so the greeting is the words alone.
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import type { Record_ } from "@sdk/enroll.ts";
import { canOpen, pinRefusal } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import { label, say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { Logo } from "../shell/Scene";
import { forget, unlockAfterReload } from "../vault";
import { pinLine } from "./pin-line";
import { Cells, PinPad } from "./register-parts";
import { pressed as padPressed } from "./pin-flow";

export function Unlock({ record, onDone, onForget, onRestore }: {
  record: Record_; onDone: (client: Client, wrapSame: boolean) => void; onForget: () => void; onRestore: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Entry closed until the paper code: the node refuses every PIN, so the button says so by not going.
  const [closed, setClosed] = useState(false);
  const [sure, setSure] = useState(false);
  const forgetting = useRef(false);   // «wipe it» runs once, however fast the taps
  const input = useRef<HTMLInputElement | null>(null);
  const field = useId();
  // The screen's own focus goes to the title (Screen); the PIN takes it after that, as the sheet's caret ring shows.
  useEffect(() => { const t = setTimeout(() => input.current?.focus(), 0); return () => clearTimeout(t); }, []);
  // the sixth digit asks the node, as the sheet has no «enter» button
  useEffect(() => { if (pin.length === PIN_LENGTH && !busy && !closed) void unlock(); }, [pin]);

  async function unlock() {
    if (!canOpen(pin, busy, closed)) { input.current?.focus(); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await unlockAfterReload(record, pin);
      if (r.ok) { setPin(""); return onDone(r.opened.client, r.opened.wrapSame); }
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

  if (sure) return <ForgetConfirm onCancel={() => setSure(false)} onForget={async () => { if (forgetting.current) return; forgetting.current = true; await forget(); onForget(); }} />;

  // the prototype's unlock (docs/newdesign/proto/unlock.html, unlock-error): the head panel with the mark, the PIN's panel
  // (the key, six dots, the pad), and the two ways out on tiles: the paper code, forget this device
  return (
    <main className="k-screen" data-screen="unlock">
      <form className="k-col" onSubmit={(e: FormEvent) => { e.preventDefault(); void unlock(); }}>
        <section className="k-panel k-head">
          <div className="k-row"><Logo size={52} /><div className="k-stack"><h1 className="k-title">{say("app.unlock.title")}</h1><p className="k-sub">{say("app.unlock.sub")}</p></div></div>
        </section>
        <section className="k-panel k-grow k-reg">
          <NdIcon name="key" className="k-big-icon k-mid" />
          <div className="k-pin" data-stage="unlock">
            <label htmlFor={field} className="k-sub">{say("reg.pin")}</label>
            <Cells id={field} text={say("web.ui.pinName")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))}
              onPaste={(e) => { e.preventDefault(); setPin(pinDigits(e.clipboardData.getData("text"))); }} inputRef={(n) => { input.current = n; }} testid="unlock-pin" />
          </div>
          {error && <div data-testid="error"><p className="k-note" data-tone="error" role="alert"><NdIcon name="alert" /><span>{error}</span></p></div>}
          {busy && <p className="k-sub k-mid" role="status" data-testid="unlock-busy">{say("web.unlock.asking")}</p>}
          <PinPad onKey={(k) => setPin((p) => padPressed(p, k))} disabled={busy || closed} />
        </section>
        <section className="k-panel k-actions">
          <div className="k-two">
            <button type="button" className="k-way k-way-72" onClick={onRestore} data-testid="unlock-restore"><span className="k-badge" data-c="1"><NdIcon name="paper" /></span><span>{say("app.unlock.paper")}</span></button>
            <button type="button" className="k-way k-way-72" onClick={() => setSure(true)} data-testid="forget"><span className="k-badge" data-c="3"><NdIcon name="device" /></span><span>{say("web.unlock.forget")}</span></button>
          </div>
        </section>
      </form>
    </main>
  );
}

/** Forgetting the identity on this device is not undone but by the paper code (the prototype's forget-confirm.html): the bar
 *  with back, the device's mark in its circle and the price, both answers outlined at the foot. */
function ForgetConfirm({ onCancel, onForget }: { onCancel: () => void; onForget: () => void }) {
  return (
    <main className="k-screen" data-screen="forget-confirm">
      <div className="k-col">
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={say("common.back")} onClick={onCancel}><NdIcon name="back" /></button>
          <h1 className="k-bar-title">{say("web.unlock.forget")}</h1>
        </header>
        <section className="k-panel k-grow k-reg k-centre-col">
          <span className="k-mark-110" aria-hidden="true"><NdIcon name="device" /></span>
          <p className="k-sub k-price">{say("app.unlock.forget_price")}</p>
        </section>
        <section className="k-panel k-actions">
          <div className="k-two">
            <button type="button" className="k-cta" data-outline="" onClick={onCancel} data-testid="forget-cancel"><NdIcon name="close" /><span>{say("app.unlock.forget_keep")}</span></button>
            <button type="button" className="k-cta" data-outline="" onClick={onForget} data-testid="forget-sure"><NdIcon name="trash" /><span>{say("app.unlock.forget_sure")}</span></button>
          </div>
        </section>
      </div>
    </main>
  );
}
