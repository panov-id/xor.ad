// Screen 03 (panel/design/sheets/screen-03.svg): the cards of the circle the
// viewer names, thirty at a time and more by cursor (protocol §6); "Здесь пока
// тихо" when nobody is speaking, with the radius as the only way to widen.
// Since W2 a card opens full-screen (Card.tsx), "написать" leads to the
// composer and "лайкнутое" to the likes; one's own phrase just sent is named
// over the list with the node's verdict — out, or read by a person first.
// The filters are not here yet.

import { useEffect, useRef, useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { ANNOUNCE_MS, announce, isStep, nearby, type Step } from "../a11y/nearby.ts";
import type { Sent } from "../api/actions.ts";
import { say } from "../locales/say.ts";

export interface FeedCard {
  id: string;
  text: string;
  mode: string;
  lang: string;
  like_count: number;
  // A neighbour's offer: the node nests the discount (routes/feed.ts deliver).
  // A venue's offer comes as kind "offer" with the venue's name (O2).
  offer?: { discount_value: string; conditions?: string | null; venue_name?: string };
  kind?: string;
  soon?: boolean;
}

export const RADII: Radius[] = [100, 300, 1000, 3000, 10000];
const label = (r: Radius) => (r >= 1000 ? say("web.feed.km", { n: r / 1000 }) : say("web.feed.m", { n: r }));

export function Feed(
  { client, sealed, at, radius, onRadius, onOpen, onWrite, onLikes, sent, gone }: {
    client: Client;
    sealed: "ok" | "failed" | "unlocked" | "unlocked-new-wrap";
    at: { lat: number; lon: number };
    radius: Radius;
    onRadius: (r: Radius) => void;
    onOpen: (card: FeedCard) => void;
    onWrite: () => void;
    onLikes: () => void;
    // One's own phrase just sent, with the node's verdict (Composer.tsx).
    sent?: { state: Exclude<Sent, { state: "refused" }>["state"]; text: string } | null;
    // A card that left this feed on the card screen: hidden, or its author blocked.
    gone?: { why: "hidden" | "blocked"; id: string } | null;
  },
) {
  const [items, setItems] = useState<FeedCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  async function load(after?: string) {
    setState("loading");
    try {
      const page = await client.feed({ ...at, radius, after });
      setItems((was) => (after ? [...was, ...(page.items as FeedCard[])] : (page.items as FeedCard[])));
      setNext(page.next ?? null);
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("failed");
    }
  }

  useEffect(() => { void load(); }, [radius]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <main className="screen feed" data-screen="feed" data-sealed={sealed}>
      <header>
        <div>
          <h1>{say("web.feed.title")}</h1>
          {/* What the reader hears: the announced step, not every flicker of it. */}
          <p className="muted nearby" aria-live="polite" role="status" data-testid="nearby" data-step={said ?? undefined}>
            {said ? nearby(said) : ""}
          </p>
        </div>
        <label className="radius">
          <span className="visually-hidden">{say("web.feed.radius")}</span>
          <select value={radius} onChange={(e) => onRadius(Number(e.target.value) as Radius)} data-testid="radius">
            {RADII.map((r) => <option key={r} value={r}>{label(r)}</option>)}
          </select>
        </label>
      </header>
      <nav className="actions">
        <button type="button" className="primary" onClick={onWrite} data-testid="write">{say("feed.write")}</button>
        <button type="button" onClick={onLikes} data-testid="likes">{say("liked.title")}</button>
      </nav>
      {sent && (
        <p className="warn" data-testid="sent" data-state={sent.state}>
          {sent.state === "published" ? say("web.feed.sent_out") : say("web.feed.sent_held")}
          «{sent.text}»
        </p>
      )}
      {gone && (
        <p className="muted" data-testid="gone" data-why={gone.why}>
          {gone.why === "hidden" ? say("web.feed.hidden") : say("web.feed.blocked")}
        </p>
      )}
      {state === "failed" && <p className="error" data-testid="error">{error}</p>}
      {state === "ready" && items.length === 0 && (
        <section className="empty" data-testid="quiet">
          <h2>{say("web.feed.empty")}</h2>
          <p className="muted">{say("web.feed.empty_hint")}</p>
          {radius < 10000 && (
            <button type="button" onClick={() => onRadius(RADII[RADII.indexOf(radius) + 1])}>
              {say("web.feed.wider", { radius: label(RADII[RADII.indexOf(radius) + 1]) })}
            </button>
          )}
        </section>
      )}
      <ul className="cards" data-testid="cards">
        {items.filter((card) => card.id !== gone?.id).map((card) => (
          <li key={card.id} className="card" data-testid="card" data-id={card.id} onClick={() => onOpen(card)} role="button" tabIndex={0}>
            {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
            <p>{card.text}</p>
            <span className="muted">{card.mode} · {card.lang} · ♥ {card.like_count}{card.soon ? say("web.feed.soon") : ""}</span>
          </li>
        ))}
      </ul>
      {state === "loading" && <p className="muted skeleton" data-testid="loading">…</p>}
      {next && state === "ready" && (
        <button type="button" onClick={() => load(next)} data-testid="more">{say("liked.more")}</button>
      )}
      <footer className="muted">
        {say("web.feed.keys", { state: sealed === "unlocked" ? say("web.feed.keys_unlocked") : sealed === "unlocked-new-wrap" ? say("web.feed.keys_new_wrap") : sealed === "ok" ? say("web.feed.keys_ok") : say("web.feed.keys_bad") })}
      </footer>
    </main>
  );
}
