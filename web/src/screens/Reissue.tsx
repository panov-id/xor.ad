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

export function Reissue({ client, onDone, onBack }: { client: Client; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [current, setCurrent] = useState("");
  const [next] = useState(() => newPaperCode());
  const [second, setSecond] = useState("");
  const [fourth, setFourth] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = paperGroups(next);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      if (readPaperText(current).length !== 16) return setError(say("restore.bad"));
      if (!await isCurrentCode(client, current)) return setError(say("restore.noMatch"));
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
      const outcome = await reissue(client, current, next);
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
    <main className="screen reissue" data-screen={`reissue-${step}`}>
      <header><h1>{say("reissue.title")}</h1></header>
      {step === 1
        ? (
          <>
            <p className="muted">{say("reissue.intro")}</p>
            <label>
              {say("restore.code")}
              <input value={current} onChange={(e) => setCurrent(e.target.value)} data-testid="reissue-current" autoComplete="off" />
            </label>
            {error && <p className="error" data-testid="error">{error}</p>}
            <button type="button" className="primary" disabled={busy || readPaperText(current).length !== 16} onClick={() => void check()} data-testid="reissue-next">
              {busy ? "…" : say("me.save")}
            </button>
            <button type="button" onClick={onBack} data-testid="reissue-back">{say("common.back")}</button>
          </>
        )
        : (
          <>
            <p className="code" data-testid="reissue-code">{groups.join(" ")}</p>
            <p className="muted">
              {say("web.reissue.writeDown")}
            </p>
            <p>{say("web.reissue.enterGroups")}</p>
            <label>
              {say("web.reissue.second")}
              <input value={second} onChange={(e) => setSecond(e.target.value)} data-testid="reissue-group-2" autoComplete="off" />
            </label>
            <label>
              {say("web.reissue.fourth")}
              <input value={fourth} onChange={(e) => setFourth(e.target.value)} data-testid="reissue-group-4" autoComplete="off" />
            </label>
            {error && <p className="error" data-testid="error">{error}</p>}
            <button type="button" className="primary" disabled={busy || !second || !fourth} onClick={() => void confirm()} data-testid="reissue-confirm">
              {say("web.reissue.done")}
            </button>
          </>
        )}
    </main>
  );
}
