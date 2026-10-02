// The arriving device's state (step 4 of the brand split): the nine
// characters, the claim, the wait for the old device's approval, the first
// PIN that seals the identity here. Moved verbatim from screens/Arrival.tsx.

import { useRef, useState } from "react";
import type { Client } from "../../../../depth/core/client.ts";
import { readPaperText } from "../../../../depth/core/paper.ts";
import type { MoveState } from "../../../../depth/core/transfer_move.ts";
import { say } from "../../api/me.ts";
import { browserLabel, ENDINGS, MOVE_POLL_MS, useEvery } from "../../api/transfer.ts";
import { type Arriving, claimArrival, keepArrived } from "../../vault.ts";

export function useArrival({ onDone }: { onDone: (client: Client, longKey: CryptoKey) => void }) {
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [into, setInto] = useState<Arriving | null>(null);
  const [state, setState] = useState<MoveState>("claimed");
  const arrived = useRef(false);
  const clean = readPaperText(code);

  useEvery(MOVE_POLL_MS, () => into?.arrival.state().then((next) => {
    if (next === "approved") arrived.current = true;
    setState(next);
  }).catch((e: Error) => setError(e.message)), !!into && state === "claimed");

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      const claimed = await claimArrival(clean, browserLabel());
      if ("arrival" in claimed) return setInto(claimed);
      if (claimed.status === 404) return setError(say("move.codeBad"));
      if (claimed.status === 409) return setError(say("move.twice"));
      // The claim's own limit (§8.2, claim.miss.*), not the PIN's words (W12-C2).
      if (claimed.status === 429) return setError(say("restore.wait", { n: String(claimed.retryAfter ?? "?") }));
      setError(`the claim was refused: ${claimed.status}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function keep() {
    if (!into) return;
    setBusy(true);
    setError(null);
    try {
      const { client, longKey } = await keepArrived(into, pin);
      onDone(client, longKey);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ending = ENDINGS[state];
  return { code, setCode, pin, setPin, again, setAgain, busy, error, into, state, clean, claim, keep, ending };
}

export type ArrivalLogic = ReturnType<typeof useArrival>;
