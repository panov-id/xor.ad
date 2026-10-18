// w4_me-reset ("Start again"): what cannot be undone said on the screen, what goes with it counted on the spot
// (depth/core/me.ts resetCounts), the PIN, "Close it for good". The web's StartAgain through the same calls:
// client.closeIdentity(pin), then this device forgets the identity (the platform's forget) and the splash opens.
// Testids (the web's): reset-warning, reset-code, reset-price, reset-pin, reset-go, error.
import { useEffect, useId, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { resetCounts } from "@sdk/me.ts";
import { pinRefusal } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import { label, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { clock, flag } from "../../shell/icons";
import { forget } from "../../vault";
import { pinLine } from "../pin-line";
import { Cells } from "../register-parts";
import { trash } from "./icons";
import { Banner, ErrorLine, Pairs, refusedStatus, SubPage } from "./parts";

export function Reset({ client, onClosed, onBack }: { client: Client; onClosed: () => void; onBack: () => void }) {
  const [counts, setCounts] = useState<{ phrases: number; chats: number } | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const field = useId();
  useEffect(() => { resetCounts(client).then(setCounts).catch((e: Error) => setRefused(e.message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = pin.length === PIN_LENGTH && counts !== null && !busy;
  async function send() {
    if (!ready) return;
    setBusy(true);
    setRefused(null);
    try {
      const answer = await client.closeIdentity(pin);
      if (answer.status === 200) { await forget(); return onClosed(); }
      const error = answer.body?.error;
      setRefused(pinLine(pinRefusal({ code: error?.code, status: answer.status, attemptsLeft: error?.attempts_left, retryAfter: answer.retryAfter }), refusedStatus(answer.status)));
      setPin("");
    } catch (e) {
      setRefused((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SubPage name="reset" title={label("reset.title")} onBack={onBack}
      foot={
        <button type="button" className="cta cta-danger" aria-disabled={ready ? undefined : true} aria-busy={busy || undefined} onClick={() => void send()} data-testid="reset-go">
          <Icon d={trash} /><span>{say("app.reset.go")}</span>
        </button>
      }>
      <Banner tone="coral" icon={flag} title={say("app.reset.undone")} text={say("app.reset.closes")} testid="reset-warning" />
      <Banner tone="yellow" icon={clock} text={say("app.reset.code")} testid="reset-code" />
      <Pairs testid="reset-price" rows={[
        [say("app.me.phrases"), counts ? say("app.reset.go_down", { n: counts.phrases }) : "…"],
        [say("app.me.talks"), counts ? say("app.reset.end", { n: counts.chats }) : "…"],
      ]} />
      <div className="reg-field me-pin-row">
        <label htmlFor={field}>{label("reset.pin")}</label>
        <Cells id={field} text={say("reset.pin")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))} testid="reset-pin" />
      </div>
      <ErrorLine text={refused} />
    </SubPage>
  );
}
