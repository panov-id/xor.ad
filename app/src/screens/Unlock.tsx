// w2_unlock (sosed Dusk, mobile_390_w2_unlock): a device that remembers an identity asks the PIN (web
// screens/Unlock.tsx, its rules are the SDK's: depth/core/pin_gate.ts, unlock.ts). The PIN goes to the node, which
// counts the misses and says how many are left; the refusal is the coral box. Ten misses close entry, and the way
// out of that, and of a seal that does not open, is the paper code.
// The same testids as the web's: unlock-pin, unlock-restore, forget, error. New design (NEWDESIGN_PLAN §7 step 5; sheets
// unlock, unlock-error, forget-confirm): the PIN's own pad, the sixth digit asks the node by itself; «forget» opens a
// screen of its own with the price and two buttons (forget-cancel, forget-sure), never a second tap on the same spot.
// The sheet greets by name ("Welcome back, Alex"); the record keeps none (the web's Locked draws no name either:
// nothing of the person on a screen before the PIN), so the greeting is the words alone.
import { useEffect, useId, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import type { Record_ } from "@sdk/enroll.ts";
import { canOpen, pinRefusal } from "@sdk/pin_gate.ts";
import { PIN_LENGTH } from "@sdk/register.ts";
import { brand } from "@brand";
import { say } from "../i18n";
import { NdIcon } from "../shell/NdIcon";
import { forget, unlockAfterReload } from "../vault";
import { pinLine } from "./pin-line";
import { PinDoor } from "./pin-door";

export function Unlock({ record, onDone, onForget, onRestore }: {
  record: Record_; onDone: (client: Client, wrapSame: boolean) => void; onForget: () => void; onRestore: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Entry closed until the paper code: the node refuses every PIN, so the button says so by not going.
  const [closed, setClosed] = useState(false);
  const [sure, setSure] = useState(false);
  // the misses seen on this screen (the dots ring and shake on each) and the attempts the node says are left
  const [refusals, setRefusals] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
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
      setRefusals((n) => n + 1);
      if (refusal.kind === "mismatch" && refusal.left !== undefined) setLeft(refusal.left);
      setError(refusal.kind === "mismatch" && refusal.left !== undefined ? say("app.unlock.wrong", { n: refusal.left }) : pinLine(refusal, say("web.vault.pinWrong")));
    } catch {
      // The node gave its share and the seal on the disk did not open with it (WebCrypto's error has no words):
      // only the paper code gets back, as the web says.
      setError(say("pin.locked"));
      setRefusals((n) => n + 1);
    }
    setPin("");
    setBusy(false);
    input.current?.focus();
  }

  if (sure) return <ForgetConfirm onCancel={() => setSure(false)} onForget={async () => { if (forgetting.current) return; forgetting.current = true; await forget(); onForget(); }} />;

  // docs/newdesign4 06/07: the line says the refusal in the accent; from the third miss «Forgot it? Use your paper code»;
  // the «⋯» on the card and «Not you? Forget this device» lead to 08 (SCREENS_spec §9)
  const line = error ?? say("app.unlock.enter");
  return (
      <PinDoor screen="unlock" line={line} tone={error ? "error" : undefined} pin={pin} setPin={setPin} inputRef={(n) => { input.current = n; }} field={field}
        testid="unlock-pin" disabled={busy || closed} onPaper={onRestore} refusals={refusals}
        more={<button type="button" className="nd-more" aria-label={say("app.unlock.more")} onClick={() => setSure(true)} data-testid="forget"><span aria-hidden="true">⋯</span></button>}
        under={<>
          {left !== null && left <= 5 && <span className="nd-tries" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} data-on={i >= 5 - left ? "" : undefined} />)}</span>}
          {busy && <p className="nd-sub" role="status" data-testid="unlock-busy">{say("web.unlock.asking")}</p>}
          {refusals >= 3 && <p className="nd-have" data-testid="unlock-forgot">{say("app.unlock.forgot")} <button type="button" className="nd-link" onClick={onRestore}>{say("app.unlock.use_paper")}</button></p>}
          {(closed || refusals >= 5) && <p className="nd-have"><button type="button" className="nd-link" onClick={() => setSure(true)} data-testid="not-you">{say("app.unlock.not_you")}</button></p>}
        </>} />
  );
}

/** docs/newdesign4 08 forget-confirm (SCREENS_spec §9, the one layout of every confirmation): back, the device's mark in its
 *  ring, two lines of title, two of what it means, the quiet price over the buttons, «Cancel» a tile and «Forget» outlined
 *  in the accent with the bin: a dangerous act is never filled. The identity on the node is not touched. */
function ForgetConfirm({ onCancel, onForget }: { onCancel: () => void; onForget: () => void }) {
  return (
    <main className="k-screen nd-screen" data-screen="forget-confirm">
      <div className="nd-col nd-confirm">
        <header className="nd-head"><button type="button" className="nd-back" aria-label={say("app.reg.back")} onClick={onCancel}><NdIcon name="back" /></button></header>
        <div className="nd-grow nd-confirm-mid">
          <span className="nd-ring-mark" aria-hidden="true"><NdIcon name="device" /></span>
          <h1 className="nd-h1">{say("app.forget.title_1", { name: brand.name })}<br />{say("app.forget.title_2")}</h1>
          <p className="nd-sub">{say("app.forget.sub_1", { name: brand.name })}<br />{say("app.forget.sub_2")}</p>
        </div>
        <p className="nd-have">{say("app.forget.price_1")}<br />{say("app.forget.price_2")}</p>
        <div className="nd-btnrow">
          <button type="button" className="nd-tile-btn" onClick={onCancel} data-testid="forget-cancel">{say("app.forget.cancel")}</button>
          <button type="button" className="nd-danger" onClick={onForget} data-testid="forget-sure"><NdIcon name="trash" />{say("app.forget.sure")}</button>
        </div>
      </div>
    </main>
  );
}
