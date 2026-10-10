// A new paper code (W6; depth/ink reissue + PaperCode): the current code
// first — checked on the device against the long key it holds, so nobody
// writes down a code a wrong current one will never let become real — then
// the new sixteen characters, shown once, the second and the fourth groups
// typed back, and the node takes the new code and drops the old in one
// transaction (recovery.ts reissue). Words verbatim from ru.json.

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { newPaperCode, paperGroups, readPaperText } from "../../../depth/core/paper.ts";
import { isCurrentCode, reissue } from "../../../depth/core/recovery.ts";
import { say } from "../api/me.ts";
import { rememberWrappedLongKey } from "../vault.ts";
import { Button } from "../ui/Button.tsx";
import { CodeField } from "../ui/CodeField.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderScreen } from "../ui/Header.tsx";
import { Info } from "../ui/Info.tsx";
import { Actions } from "../ui/Links.tsx";
import { Screen } from "../ui/Screen.tsx";

export function Reissue({ client, onDone, onBack }: { client: Client; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  // The current code as four boxes (CodeField); the new one's second and fourth group, typed back.
  const [current, setCurrent] = useState<string[]>(["", "", "", ""]);
  const currentText = current.join(" ");
  const [next] = useState(() => newPaperCode());
  const [typed, setTyped] = useState<string[]>(["", ""]);
  const [second, fourth] = typed;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = paperGroups(next);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      if (readPaperText(currentText).length !== 16) return setError(say("restore.bad"));
      if (!await isCurrentCode(client, currentText)) return setError(say("restore.noMatch"));
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (readPaperText(second) !== groups[1] || readPaperText(fourth) !== groups[3]) {
      return setError(say("web.reissue.mismatch"));
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await reissue(client, currentText, next);
      if (!outcome.ok) {
        const o = outcome as { reason?: string; status?: number };
        return setError(o.reason === "no_match" ? say("restore.noMatch") : say("restore.refused", { status: String(o.status ?? o.reason ?? "?") }));
      }
      // The long key under the new code is what a later reissue opens: the
      // record on this device keeps it too.
      await rememberWrappedLongKey(client);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen name={`reissue-${step}`} title={say("reissue.title")} header={<HeaderScreen title={say("reissue.title")} />}>
      {step === 1
        ? (
          <>
            <div className="ui-info-row"><Info label={say("web.info.reissue")} data-testid="reissue-info"><p>{say("reissue.intro")}</p></Info></div>
            <div data-testid="reissue-current"><CodeField value={current} onChange={setCurrent} /></div>
            {error && <div data-testid="error"><ErrorLine>{error}</ErrorLine></div>}
            <Actions>
              <Button type="button" icon="back" className="ui-wide" aria-label={say("common.back")} onClick={onBack} data-testid="reissue-back" />
              <Button type="button" kind="primary" icon="check" className="ui-wide" aria-label={say("me.save")} aria-busy={busy} disabled={busy || readPaperText(currentText).length !== 16} onClick={() => void check()} data-testid="reissue-next" />
            </Actions>
          </>
        )
        : (
          <>
            <p data-testid="reissue-code">{groups.join(" ")}</p>
            <div className="ui-info-row"><Info label={say("web.info.code")} data-testid="reissue-write-info"><p>{say("web.reissue.writeDown")}</p></Info></div>
            <p>{say("web.reissue.enterGroups")}</p>
            <div data-testid="reissue-groups"><CodeField groups={[2, 4]} value={typed} onChange={setTyped} /></div>
            {error && <div data-testid="error"><ErrorLine>{error}</ErrorLine></div>}
            <Button type="button" kind="primary" icon="check" className="ui-wide" aria-label={say("web.reissue.done")} disabled={busy || !second || !fourth} onClick={() => void confirm()} data-testid="reissue-confirm" />
          </>
        )}
    </Screen>
  );
}
