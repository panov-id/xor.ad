// The PIN after a reload (screen 12 of the storefronts, its first state): the
// device remembers an identity, the PIN opens it — through the node, which
// counts the misses and says how many are left (chat spec §8.2). The way out
// of a lock, and of a seal that does not open, is the paper code (V2).

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { canOpen, pinRefusal } from "../../../depth/core/pin_gate.ts";
import { forget, PinRefused, type Record_, unlockAfterReload } from "../vault.ts";
import { say } from "../locales/say.ts";
import { Button } from "../ui/Button.tsx";
import { FormCard } from "../ui/FormCard.tsx";
import { PinField } from "../ui/Field.tsx";
import { Info } from "../ui/Info.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Split } from "../ui/Split.tsx";
import { pinMismatch } from "../pinWords.ts";

// The node's refusal as one line, in the terminal's words (depth/ink/locales/
// ru.json pin.*, verbatim). 401 is a session the tenth miss froze — the guard
// answers before the PIN is checked — and reads as the lock; 429 is "too
// soon", the PIN was not checked, so no attempts are named (verifier of W1c).
function pinLine(e: PinRefused): string {
  // What the refusal means is the core's (pin_gate.ts pinRefusal, shared with the app shell); the words are here.
  const r = pinRefusal({ code: e.code, attemptsLeft: e.attemptsLeft, retryAfter: e.retryAfter });
  // With the second sentence of §8.2 on the last three attempts (W14-WP; pinWords.ts).
  if (r.kind === "mismatch") return pinMismatch(r.left);
  if (r.kind === "locked") return say("pin.locked");
  if (r.kind === "wait") return say("pin.wait", { n: r.seconds ?? "?" });
  return e.message;
}

export function Unlock({ record, onDone, onForget, onRestore }: { record: Record_; onDone: (client: Client, longKey: CryptoKey, wrapSame: boolean) => void; onForget: () => void; onRestore: () => void }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unlock() {
    setBusy(true);
    setError(null);
    try {
      const { client, longKey, wrapSame } = await unlockAfterReload(record, pin);
      onDone(client, longKey, wrapSame);
    } catch (e) {
      if (e instanceof PinRefused) {
        setError(pinLine(e));
      } else {
        // The node gave its share, and the seal on the disk did not open with
        // it (WebCrypto's OperationError carries no words): only the paper
        // code gets back. The line is the lock's own until chat_RU.md says
        // one for this case (owner.md, 27.09.2026).
        setError(say("pin.locked"));
      }
      setPin("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen name="unlock" title={say("reg.pin")}>
      {/* «forget» is not on the sheet's Split (adaptive-sosed-unlock.svg: «open» · «paper code»); it waits behind the (i).
          No header bar on the sheet: the title is the card's h1. */}
      <FormCard icon="key" title={say("reg.pin")} heading error={error} info={
        <Info label={say("web.info.pin")} data-testid="unlock-info">
          <p>{say("web.unlock.remembers")}</p>
          <Button type="button" icon="forget" aria-label={say("web.unlock.forget")} onClick={async () => { await forget(); onForget(); }} data-testid="forget" />
        </Info>
      }>
        <PinField value={pin} onChange={setPin} data-testid="unlock-pin" />
      </FormCard>
      <div data-part="foot">
        <Split>
          <Button type="button" kind="primary" icon="key" aria-label={busy ? say("web.unlock.asking") : say("inbox.enter")} aria-busy={busy} disabled={!canOpen(pin, busy)} onClick={unlock} data-testid="unlock" />
          {error && <Button type="button" icon="code" aria-label={say("web.unlock.restore")} onClick={onRestore} data-testid="unlock-restore" />}
        </Split>
      </div>
    </Screen>
  );
}
