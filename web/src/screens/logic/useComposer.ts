// The composer's state and the send (step 4 of the brand split): text up to
// the node's limit, mode, zone, the neighbour's discount, the node's verdict.
// Moved verbatim from screens/Composer.tsx.

import { useEffect, useState } from "react";
import type { Client, Radius } from "../../../../depth/core/client.ts";
import { say } from "../../locales/say.ts";
import { sayPhrase, type Mode, type Sent } from "../../api/actions.ts";

export function useComposer(
  { client, at, radius, onSent }: {
    client: Client;
    at: { lat: number; lon: number };
    radius: Radius;
    onSent: (sent: Exclude<Sent, { state: "refused" }>, text: string) => void;
  },
) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("alone");
  // The zone starts at the feed's circle and is the phrase's own from here.
  const [zone, setZone] = useState<Radius>(radius);
  // A discount makes the phrase a neighbour's offer (offers spec; feed.ts
  // takes discount_value with conditions): the card shows it, a like on it
  // makes the match at once (§8.5). Empty — an ordinary phrase.
  const [discount, setDiscount] = useState("");
  const [conditions, setConditions] = useState("");
  // The node's limit, not a number of our own: GET /limits says what POST /feed
  // refuses by (protocol, 2026-09-22). Until it answers, the contract's 128.
  const [limit, setLimit] = useState(128);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  useEffect(() => {
    client.limits().then((l) => setLimit(l.phrase_length)).catch(() => {});
  }, [client]);

  const used = [...text].length;
  const empty = text.trim() === "";

  async function send() {
    setBusy(true);
    setRefused(null);
    try {
      const sent = await sayPhrase(client, {
        text: text.trim(), mode, ...at, radius: zone,
        ...(discount.trim() ? { discount_value: discount.trim(), ...(conditions.trim() ? { conditions: conditions.trim() } : {}) } : {}),
      });
      if (sent.state === "refused") setRefused(sent.why);
      else onSent(sent, text.trim());
    } catch (e) {
      setRefused(say("web.composer.failed", { why: (e as Error).message }));
    } finally {
      setBusy(false);
    }
  }

  return { text, setText, mode, setMode, zone, setZone, discount, setDiscount, conditions, setConditions, limit, busy, refused, used, empty, send };
}

export type ComposerLogic = ReturnType<typeof useComposer>;
