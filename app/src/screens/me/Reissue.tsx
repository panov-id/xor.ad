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
import { NdIcon } from "../../shell/NdIcon";
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
  const ready = step === 1 ? nextReady(current, busy) : doneReady(typed, busy);
  const glyph = current.padEnd(CODE_LENGTH, " ");
  return (
    <SubPage name={`reissue-${step}`} title={label("reissue.title")} steps={{ n: step, of: STEPS, words }} backTestid="reissue-back" panelClass="k-me-panel k-me-reissue"
      onBack={step === 1 ? onBack : () => { setStep(1); setTyped(["", ""]); setError(null); }}
      foot={
        <button type="button" className={ready ? "cta cta-primary" : "cta cta-quiet"} aria-disabled={ready ? undefined : true} aria-busy={busy || undefined}
          onClick={() => void (step === 1 ? check_() : confirm())} data-testid={step === 1 ? "reissue-next" : "reissue-confirm"}>
          <NdIcon name={step === 1 ? "chev" : "check"} /><span>{busy ? say("web.unlock.asking") : step === 1 ? say("app.reissue.next") : label("web.register.done")}</span>
        </button>
      }>
      {step === 1 ? (
        <>
          <div className="k-row k-me-lead"><NdIcon name="paper" className="k-big-icon k-40" /><div className="k-stack"><h2 className="k-title">{say("app.reissue.current_title")}</h2><p className="k-sub">{say("app.reissue.current_lead")}</p></div></div>
          <div className="k-gcells" data-testid="reissue-current-cells">
            {Array.from({ length: 4 }, (_, g) => (
              <span key={g} className="k-gcell" aria-hidden="true" data-filled={glyph.slice(g * 4, g * 4 + 4).trim() ? "yes" : undefined}>{glyph.slice(g * 4, g * 4 + 4).trim() || "– – – –"}</span>
            ))}
            <input id={codeField} aria-label={say("restore.code")} type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false}
              value={current} onChange={(e) => setCurrent(codeChars(e.target.value))}
              onPaste={(e) => { e.preventDefault(); setCurrent(codeChars(e.clipboardData.getData("text"))); }}
              onKeyDown={(e) => { if (e.key === "Enter") void check_(); }} data-testid="reissue-current" />
          </div>
          <p className="k-note k-me-note" role="status"><NdIcon name="device" /><span>{say("app.reissue.current_sub")}</span></p>
        </>
      ) : (
        <>
          <div className="k-row k-me-lead"><NdIcon name="paper" className="k-big-icon k-40" /><div className="k-stack"><h2 className="k-title">{say("app.reg.your_code")}</h2><p className="k-sub">{say("app.reissue.new_sub")}</p></div></div>
          <p className="k-groups" data-testid="reissue-code">
            {groups.map((g, i) => <span key={i} data-group={i + 1}>{g}{i < groups.length - 1 ? " " : ""}</span>)}
          </p>
          <p className="k-note k-me-note" role="status"><NdIcon name="alert" /><span>{say("app.reissue.note")}</span></p>
          <div className="k-row k-me-pen"><NdIcon name="pen" className="k-28" /><span className="k-row-name">{say("web.reissue.enterGroups")}</span></div>
          <div role="group" aria-label={say("web.reissue.enterGroups")} data-testid="reissue-groups" className="k-type-row k-me-four">
            {Array.from({ length: 4 }, (_, slot) => {
              const i = (PLACES as readonly number[]).indexOf(slot + 1);
              if (i < 0) return <span key={slot} className="k-type k-me-given" aria-hidden="true">{groups[slot]}</span>;
              return (
                <div className="k-type" key={slot}>
                  <label htmlFor={ids[i]} className="k-sr">{say("app.reg.type_group", { n: slot + 1 })}</label>
                  <Cells id={ids[i]} text={say("app.reg.type_group", { n: slot + 1 })} value={typed[i] ?? ""} size={4} onChange={(v) => write(i, v)}
                    onPaste={(e) => { e.preventDefault(); write(i, e.clipboardData.getData("text")); }}
                    onKeyDown={(e) => { if (e.key === "Backspace" && (typed[i] ?? "") === "" && i > 0) { e.preventDefault(); inputs.current[i - 1]?.focus(); } }}
                    inputRef={(node) => { inputs.current[i] = node; }} />
                </div>
              );
            })}
          </div>
        </>
      )}
      <ErrorLine text={error} />
    </SubPage>
  );
}
