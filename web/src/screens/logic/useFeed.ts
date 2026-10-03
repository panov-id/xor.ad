// The feed's state and actions (step 4 of the brand split): the cards of the
// circle, paging by cursor, one's own phrase taken down, the moderator's
// refusals since the inbox's last look, and the header's live step — what
// every brand's FeedView draws. Moved verbatim from screens/Feed.tsx.

import { useEffect, useRef, useState } from "react";
import type { Client, Radius } from "../../../../depth/core/client.ts";
import { ANNOUNCE_MS, announce, isStep, type Step } from "../../a11y/nearby.ts";
import { takeDownPhrase } from "../../api/actions.ts";
import type { FeedCard } from "../Feed.tsx";

export function useFeed(
  { client, at, radius, sent, onTakenDown }: {
    client: Client;
    at: { lat: number; lon: number };
    radius: Radius;
    sent?: { id?: string } | null;
    onTakenDown?: () => void;
  },
) {
  const [items, setItems] = useState<FeedCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  // Taking one's own phrase down (§8.3): a press on the sent line's handle,
  // DELETE /feed/:id; a refusal is said under the line with the node's number.
  const [takingDown, setTakingDown] = useState(false);
  const [takedownRefused, setTakedownRefused] = useState<number | null>(null);
  async function takeDown() {
    if (!sent?.id) return;
    setTakingDown(true);
    setTakedownRefused(null);
    const done = await takeDownPhrase(client, sent.id);
    setTakingDown(false);
    if (!done.ok) return setTakedownRefused(done.status);
    onTakenDown?.();
  }

  // A page asked before the radius changed (or before leaving the feed) is
  // stale: its answer would mix the old circle's cards into the new one (D2,
  // panel 2026-10-03). Every radius starts a new generation; only an answer of
  // the current one is drawn.
  const generation = useRef(0);
  async function load(after?: string) {
    const mine = generation.current;
    setState("loading");
    try {
      const page = await client.feed({ ...at, radius, after });
      if (mine !== generation.current) return;
      setItems((was) => (after ? [...was, ...(page.items as FeedCard[])] : (page.items as FeedCard[])));
      setNext(page.next ?? null);
      setState("ready");
    } catch (e) {
      if (mine !== generation.current) return;
      setError((e as Error).message);
      setState("failed");
    }
  }

  useEffect(() => {
    generation.current += 1;
    void load();
    return () => { generation.current += 1; };
  }, [radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the moderator refused of one's own (W12-MRc, the owner's decision of
  // 2026-10-01): GET /inbox?since counts the moments after the inbox's last
  // look — an hour and at most six (relay lib/inbox_events.ts) — no id, no
  // text, so the line names no phrase. Read once on entering the feed; one's
  // own next phrase puts it out. The inbox out of reach is not the feed's error.
  const [refused, setRefused] = useState(0);
  useEffect(() => {
    let live = true;
    const since = Number(sessionStorage.getItem("xor-inbox-last-look") ?? "") || undefined;
    client.inboxSince(since)
      .then(({ events }) => { if (live) setRefused(events?.phrases_refused ?? 0); })
      .catch(() => {});
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The header's live step (design.nearby.live; web/src/a11y/nearby.ts): read
  // with every radius, shown at once, but handed to the polite live region
  // only when it changed and not more often than ANNOUNCE_MS — a suppressed
  // change is said when the window opens, not lost.
  const [step, setStep] = useState<Step | null>(null);
  const [said, setSaid] = useState<Step | null>(null);
  const announced = useRef<{ said: Step | null; at: number }>({ said: null, at: 0 });
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let live = true;
    client.density({ ...at, radius })
      .then((answer) => { if (live && answer.status === 200 && isStep(answer.body.step)) setStep(answer.body.step); })
      .catch(() => {});
    return () => { live = false; };
  }, [radius]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step === null) return;
    const tell = () => {
      const { say, state } = announce(announced.current, step, Date.now());
      announced.current = state;
      if (say) setSaid(say);
      else if (state.said !== step) {
        if (retry.current) clearTimeout(retry.current);
        retry.current = setTimeout(tell, Math.max(0, state.at + ANNOUNCE_MS - Date.now()));
      }
    };
    tell();
    return () => { if (retry.current) clearTimeout(retry.current); };
  }, [step]);

  return { items, next, state, error, takingDown, takedownRefused, takeDown, load, refused, said };
}

export type FeedLogic = ReturnType<typeof useFeed>;
