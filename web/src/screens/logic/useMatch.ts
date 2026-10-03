// A match's state and actions (step 4 of the brand split): "talk" with the
// consent, "not now" and its undo, the wait that asks the inbox whether the
// other said "not now", and the lines queued meanwhile. Moved verbatim from
// screens/Match.tsx.

import { useEffect, useState } from "react";
import type { ChatKeys } from "../../chat/keys.ts";
import type { Client } from "../../../../depth/core/client.ts";
import type { MatchRow } from "../Inbox.tsx";

export type Phrase = { text: string; mode: string; expires_at?: number };

// How often a waiting match asks the inbox whether the other said "not now".
const WAIT_LOOK_MS = 5000;

export function useMatch({ client, keys, row, onAgreed, onDeclined }: {
  client: Client;
  keys: ChatKeys;
  row: MatchRow;
  onAgreed: (chatId: string) => void;
  onDeclined?: (row: MatchRow, declined: boolean) => void;
}) {
  // The row as GET /inbox gives it since N1: the other's end on `phrase`, and
  // my own phrase in the match as `my_phrase` (openapi InboxItem).
  const lived = row as MatchRow & { phrase: Phrase; my_phrase?: Phrase };
  const theirs = lived.phrase;
  const mine = lived.my_phrase;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declined, setDeclined] = useState(false);
  // The node remembers my consent (GET /inbox my_consent, P10): after a reload
  // the match I agreed to waits, and "Поговорить" is not offered again (W7).
  const [waiting, setWaiting] = useState(row.my_consent === "waiting" || row.my_consent === "gone");
  // The other said "not now" to my wait (GET /inbox my_consent "gone", Q9);
  // their undo, while the match lives, brings the wait back.
  const [gone, setGone] = useState(row.my_consent === "gone");
  useEffect(() => {
    if (!waiting) return;
    let live = true;
    const look = async () => {
      try {
        const mine = (await client.inbox()).find((r) => r.id === row.id) as MatchRow | undefined;
        if (!live || !mine) return;
        const now = mine.my_consent === "gone";
        if (now) keys.dropQueued(row.id);
        setGone(now);
      } catch {
        // The next look tries again; the wait is not an error to show.
      }
    };
    void look();
    const timer = setInterval(look, WAIT_LOOK_MS);
    return () => { live = false; clearInterval(timer); };
  }, [waiting, client, keys, row.id]);
  const [line, setLine] = useState("");

  async function talk() {
    setBusy(true);
    setError(null);
    try {
      const answer = await keys.consent(row.id);
      if (answer.status !== 200) throw new Error(`the consent was refused: ${answer.status} ${JSON.stringify(answer.body)}`);
      if (answer.body.state === "agreed" && answer.body.chat_id) return onAgreed(answer.body.chat_id);
      setWaiting(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function notNow() {
    setBusy(true);
    setError(null);
    try {
      const answer = declined ? await client.undoDecline(row.id) : await client.decline(row.id);
      if (answer.status !== 204) throw new Error(`the node refused: ${answer.status}`);
      if (!declined) keys.dropQueued(row.id);
      setDeclined(!declined);
      onDeclined?.(row, !declined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return { theirs, mine, busy, error, declined, waiting, gone, line, setLine, talk, notNow };
}

export type MatchLogic = ReturnType<typeof useMatch>;
