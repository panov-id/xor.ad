// w4_reissue-1, w4_reissue-2 (sosed Dusk, mobile): a new paper code (web screens/Reissue.tsx, depth/core/recovery.ts).
// Step 1: the current code, sixteen cells, checked on this device against the long key it holds (isCurrentCode: nobody
// writes down a code that a wrong current one will never let become real). Step 2: the new code on its lime plate, shown
// once, the second and the fourth group typed back; "Done" is the one call to the node (reissue: the node takes the new
// code and drops the old in one transaction), then the long key under the new code goes into the record on this disk
// (vault.ts rememberWrappedLongKey), so a later reissue opens it after a reload. Testids (the web's): reissue-back,
// reissue-current, reissue-next, reissue-code, reissue-groups, reissue-confirm, error.
// The back of step 2 goes to step 1 (the sheet draws it; the web has none there): nothing was sent yet, the new code stays.
import { useId, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { newPaperCode, paperGroups } from "@sdk/paper.ts";
import { isCurrentCode, reissue } from "@sdk/recovery.ts";
import type { Outcome } from "@sdk/recovery.ts";
import { layOutGroups } from "@sdk/register.ts";
import { failedLine, label, say } from "../../i18n";
import { Icon } from "../../shell/Icon";
import { arrowRight, check, tag } from "../../shell/icons";
import { rememberWrappedLongKey } from "../../vault";
import { Cells } from "../register-parts";
import { ErrorLine, SubPage } from "./parts";
import { asPaperText, codeChars, doneReady, groupsAgree, nextReady, notACode, PLACES, refusalLine } from "./reissue-logic";
import { CODE_LENGTH } from "./restore-logic";

const STEPS = 2;

export function Reissue({ client, onDone, onBack }: { client: Client; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [current, setCurrent] = useState("");
  const [next] = useState(() => newPaperCode());
  const [typed, setTyped] = useState<string[]>(["", ""]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = paperGroups(next);
  const codeField = useId();
  const ids = [useId(), useId()];
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  async function check_() {
    if (!nextReady(current, busy)) return;
    const bad = notACode(current);
    if (bad) return setError(say(bad));
    setBusy(true);
    setError(null);
    try {
      if (!await isCurrentCode(client, asPaperText(current))) return setError(say("restore.noMatch"));
      setStep(2);
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!doneReady(typed, busy)) return;
    if (!groupsAgree(groups, typed)) return setError(say("web.reissue.mismatch"));
    setBusy(true);
    setError(null);
    try {
      const outcome = await reissue(client, asPaperText(current), next);
      if (!outcome.ok) {
        const line = refusalLine(outcome as Extract<Outcome, { ok: false }>);
        return setError(say(line.key, line.values));
      }
      await rememberWrappedLongKey(client);
      onDone();
    } catch (e) {
      setError(failedLine(e));
    } finally {
      setBusy(false);
    }
  }

  const write = (index: number, raw: string) => {
    const laid = layOutGroups(typed, index, raw, PLACES);
    setTyped(laid.next);
    if (laid.focus !== null) inputs.current[laid.focus]?.focus();
  };
  const words = say("web.register.step", { n: step, m: STEPS });
  const head = (
    <div className="reg-head ri-steps" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step} aria-valuetext={words} aria-label={words} data-testid="steps">
      <p className="reg-step" aria-hidden="true">{label("web.register.step", { n: step, m: STEPS })}</p>
      <div className="reg-bars" aria-hidden="true">
        {Array.from({ length: STEPS }, (_, i) => <span key={i} data-done={i < step ? "yes" : undefined} />)}
      </div>
    </div>
  );
  const ready = step === 1 ? nextReady(current, busy) : doneReady(typed, busy);
  return (
    <SubPage name={`reissue-${step}`} title={label("reissue.title")} head={head} backTestid="reissue-back"
      onBack={step === 1 ? onBack : () => { setStep(1); setTyped(["", ""]); setError(null); }}
      foot={
        <button type="button" className="cta cta-primary" aria-disabled={ready ? undefined : true} aria-busy={busy || undefined}
          onClick={() => void (step === 1 ? check_() : confirm())} data-testid={step === 1 ? "reissue-next" : "reissue-confirm"}>
          <Icon d={step === 1 ? arrowRight : check} /><span>{busy ? say("web.unlock.asking") : step === 1 ? say("app.reissue.next") : label("web.register.done")}</span>
        </button>
      }>
      {step === 1 ? (
        <>
          <h2 className="me-title">{say("app.reissue.current_title")}</h2>
          <p className="me-lead">{say("app.reissue.current_sub")}</p>
          <div className="reg-field restore-code">
            <Cells id={codeField} text={say("restore.code")} value={current} size={CODE_LENGTH} onChange={(v) => setCurrent(codeChars(v))}
              onPaste={(e) => { e.preventDefault(); setCurrent(codeChars(e.clipboardData.getData("text"))); }}
              onKeyDown={(e) => { if (e.key === "Enter") void check_(); }} testid="reissue-current" />
          </div>
        </>
      ) : (
        <>
          <section className="reg-plate">
            <p className="reg-plate-head"><Icon d={tag} /><span>{say("app.reg.your_code")}</span></p>
            <p className="reg-plate-groups" data-testid="reissue-code">
              {groups.map((g, i) => <span key={i} data-group={i + 1}>{g}{i < groups.length - 1 ? " " : ""}</span>)}
            </p>
            <p className="reg-plate-note">{say("app.reissue.note")}</p>
          </section>
          <div role="group" aria-label={say("web.reissue.enterGroups")} data-testid="reissue-groups">
            {PLACES.map((place, i) => (
              <div className="reg-field" key={place}>
                <label htmlFor={ids[i]}>{say("app.reg.type_group", { n: place })}</label>
                <Cells id={ids[i]} text={say("app.reg.type_group", { n: place })} value={typed[i] ?? ""} size={4} onChange={(v) => write(i, v)}
                  onPaste={(e) => { e.preventDefault(); write(i, e.clipboardData.getData("text")); }}
                  onKeyDown={(e) => { if (e.key === "Backspace" && (typed[i] ?? "") === "" && i > 0) { e.preventDefault(); inputs.current[i - 1]?.focus(); } }}
                  inputRef={(node) => { inputs.current[i] = node; }} />
              </div>
            ))}
          </div>
        </>
      )}
      <ErrorLine text={error} />
    </SubPage>
  );
}
