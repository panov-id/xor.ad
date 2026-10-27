// w4_me-reset ("Start again"): what cannot be undone said on the screen, what goes with it counted on the spot
// (depth/core/me.ts resetCounts), the PIN, "Close it for good". The web's StartAgain through the same calls:
// client.closeIdentity(typed), then this device forgets the identity (the platform's forget) and the splash opens.
// Testids (the web's): reset-warning, reset-code, reset-price, reset-pin, reset-go, error.
import { useEffect, useId, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { resetCounts } from "@sdk/me.ts";
import { pinRefusal } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH } from "@sdk/register.ts";
import { failedLine, label, say } from "../../i18n";
import { NdIcon } from "../../shell/NdIcon";
import { forget } from "../../vault";
import { pinLine } from "../pin-line";
import { pressed } from "../pin-flow";
import { Cells, PinPad } from "../register-parts";
import { ErrorLine, refusedStatus, SubPage } from "./parts";

export function Reset({ client, onClosed, onBack }: { client: Client; onClosed: () => void; onBack: () => void }) {
  const [counts, setCounts] = useState<{ phrases: number; chats: number } | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const field = useId();
  useEffect(() => { resetCounts(client).then(setCounts).catch((e: Error) => setRefused(failedLine(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = pin.length === PIN_LENGTH && counts !== null && !busy;
  // six digits typed before the counts came: the sixth press found nothing to send with, so they go once the counts are here
  useEffect(() => { if (counts !== null && pin.length === PIN_LENGTH && !busy) void send(pin); }, [counts]); // eslint-disable-line react-hooks/exhaustive-deps
  async function send(typed: string) {
    if (typed.length !== PIN_LENGTH || counts === null || busy) return;
    setBusy(true);
    setRefused(null);
    try {
      const answer = await client.closeIdentity(typed);
      if (answer.status === 200) { await forget(); return onClosed(); }
      const error = answer.body?.error;
      setRefused(pinLine(pinRefusal({ code: error?.code, status: answer.status, attemptsLeft: error?.attempts_left, retryAfter: answer.retryAfter }), refusedStatus(answer.status)));
      setPin("");
    } catch (e) {
      setRefused(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  // the prototype's reset.html: the mark, three tiles of what goes with it, six dots, the pad; no foot panel — the sixth digit
  // on the pad sends, the button for keyboard and reader is there but not drawn
  const press = (k: string) => {
    const was = pin;
    const now = pressed(was, k);
    setPin(now);
    if (now.length === PIN_LENGTH && was.length < PIN_LENGTH && counts !== null && !busy) void send(now);
  };
  return (
    <SubPage name="reset" title={label("reset.title")} onBack={onBack} panelClass="k-me-reset">
      <div className="k-me-trash"><NdIcon name="trash" className="k-60" /></div>
      <div className="k-sr" data-testid="reset-warning"><strong>{say("app.reset.undone")}</strong><p>{say("app.reset.closes")}</p></div>
      <div className="k-me-three" data-testid="reset-price">
        <div className="k-me-fact" aria-label={counts ? say("app.reset.go_down", { n: counts.phrases }) : undefined}>
          <span className="k-badge" data-c="3" aria-hidden="true"><NdIcon name="phrase" /></span><span className="k-row-name">{say("app.me.phrases")}</span>
          <span className="k-meta">{counts ? say("app.reset.go_down", { n: counts.phrases }) : "…"}</span>
        </div>
        <div className="k-me-fact" aria-label={counts ? say("app.reset.end", { n: counts.chats }) : undefined}>
          <span className="k-badge" data-c="3" aria-hidden="true"><NdIcon name="talks" /></span><span className="k-row-name">{say("app.me.talks")}</span>
          <span className="k-meta">{counts ? say("app.reset.end", { n: counts.chats }) : "…"}</span>
        </div>
        <div className="k-me-fact" data-testid="reset-code">
          <span className="k-badge" data-c="1" aria-hidden="true"><NdIcon name="paper" /></span><span className="k-row-name">{say("app.reset.paper")}</span>
          <span className="k-meta">{say("app.reset.code")}</span>
        </div>
      </div>
      <div className="k-field-wrap k-me-dots">
        <label htmlFor={field} className="k-sr">{label("reset.pin")}</label>
        <Cells id={field} text={say("reset.pin")} value={pin} size={PIN_LENGTH} secret onChange={(v) => setPin(pinDigits(v))} testid="reset-pin" />
      </div>
      <ErrorLine text={refused} />
      <button type="button" className="k-sr" aria-disabled={ready ? undefined : true} aria-busy={busy || undefined} onClick={() => void send(pin)} data-testid="reset-go">{say("app.reset.go")}</button>
      <PinPad onKey={press} disabled={busy} />
    </SubPage>
  );
}
