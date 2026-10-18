// w4_me-pin: the current PIN, the new one twice, "Save the PIN". The web's ChangePin through the same call — the
// platform's changePinAndReseal (depth/web-platform/vault_keep.ts): the old PIN proved, the PIN changed, the vault
// sealed again under the new one, so the next reload opens with it. Testids: pin-current, pin-next, pin-again,
// pin-go, error (the web's).
import { useId, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { pinRefusal } from "@sdk/pin_gate.ts";
import { pinDigits, PIN_LENGTH, pinsDiffer, pinsMatch } from "@sdk/register.ts";
import { failedLine, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { check } from "../../shell/icons";
import { changePinAndReseal } from "../../vault";
import { pinLine } from "../pin-line";
import { Cells } from "../register-parts";
import { ErrorLine, refusedStatus, SubPage } from "./parts";

type Which = "current" | "next" | "again";
const ROWS: Array<[Which, string, string]> = [["current", "app.pin.current", "pin-current"], ["next", "app.pin.next", "pin-next"], ["again", "app.pin.again", "pin-again"]];

export function ChangePin({ client, onDone, onBack }: { client: Client; onDone: () => void; onBack: () => void }) {
  const [v, setV] = useState<Record<Which, string>>({ current: "", next: "", again: "" });
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const ids = { current: useId(), next: useId(), again: useId() };
  const ready = new RegExp(`^\\d{${PIN_LENGTH}}$`).test(v.current) && pinsMatch(v.next, v.again) && !busy;
  async function send() {
    if (!ready) return;
    setBusy(true);
    setRefused(null);
    try {
      const answer = await changePinAndReseal(client, v.current, v.next);
      if (answer.status === 200) return onDone();
      const error = answer.body?.error;
      setRefused(pinLine(pinRefusal({ code: error?.code, status: answer.status, attemptsLeft: error?.attempts_left, retryAfter: answer.retryAfter }), refusedStatus(answer.status)));
      setV({ current: "", next: v.next, again: v.again });
    } catch (e) {
      setRefused(failedLine(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SubPage name="change-pin" title={say("app.pin.title")} onBack={onBack}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={ready ? undefined : true} aria-busy={busy || undefined} onClick={() => void send()} data-testid="pin-go">
          <Icon d={check} /><span>{busy ? say("web.unlock.asking") : say("app.pin.save")}</span>
        </button>
      }>
      {ROWS.map(([which, key, testid]) => (
        <div className="reg-field me-pin-row" key={which}>
          <label htmlFor={ids[which]}>{say(key)}</label>
          <Cells id={ids[which]} text={say(key)} value={v[which]} size={PIN_LENGTH} secret invalid={which === "again" && pinsDiffer(v.next, v.again)}
            onChange={(x) => setV((was) => ({ ...was, [which]: pinDigits(x) }))} testid={testid} />
        </div>
      ))}
      {pinsDiffer(v.next, v.again) && <p className="me-error" data-testid="pin-differ">{say("reg.pinMismatch")}</p>}
      <ErrorLine text={refused} />
    </SubPage>
  );
}
