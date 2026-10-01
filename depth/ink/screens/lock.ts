// The lock (docs/depth-client_RU.md, the paragraph of 2026-09-17): after five
// minutes without a key the screen is wiped to one line — `ПИН ›` — with no
// name, no count of conversations, no "new" mark. Six digits and enter go to
// the node as the PIN's proof (Client.unlock → POST /vault/share); the node
// counts the attempts, so a refusal says what it says at start-up: attempts
// left, entry closed until the paper code, or too soon.
import { createElement as h, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Client, HeldLongKey } from "../../core/client.ts";
import type { Say } from "../strings.ts";
import { useKeys } from "../parts.ts";
import { pinMismatch } from "../screens.ts";

export function Lock(
  { say, client, hold, onUnlocked, onError }: {
    say: Say;
    client: Client;
    // The keeper for the long key the seal gives back (transfer.ts HeldKey),
    // as register and restore take it.
    hold?: (extractable: CryptoKey) => Promise<HeldLongKey>;
    onUnlocked: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [pin, setPin] = useState("");
  const [sending, setSending] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const send = () => {
    if (pin.length !== 6 || sending) return;
    setSending(true);
    setRefused(null);
    const typed = pin;
    // The PIN leaves the screen with its proof (B31, F23).
    setPin("");
    client.unlock(typed, { hold })
      .then((r) => {
        if (r.ok) return onUnlocked();
        const error = (r.answer.body as { error?: { code?: string; attempts_left?: number } } | null)?.error;
        if (error?.code === "pin_mismatch") return setRefused(pinMismatch(say, error.attempts_left));
        if (error?.code === "pin_locked") return setRefused(say("pin.locked"));
        if (error?.code === "rate_limited") return setRefused(say("pin.wait", { n: String(r.answer.retryAfter ?? "?") }));
        onError(`unlocking was refused: ${r.answer.status}`);
      })
      .catch((e: Error) => onError(e.message))
      .finally(() => setSending(false));
  };
  useKeys((input, key) => {
    if (sending) return;
    if (key.return) return send();
    if (key.backspace || key.delete) return setPin((p) => p.slice(0, -1));
    if (input && /^[0-9]+$/.test(input)) setPin((p) => (p + input).slice(0, 6));
  });
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, null, `${say("lock.prompt")} ${"•".repeat(pin.length)}${sending ? "…" : "_"}`),
    refused ? h(Text, { color: "red" }, refused) : null,
  );
}
