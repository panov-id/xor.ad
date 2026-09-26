// Screen 03 (panel/design/sheets/screen-03.svg): the cards of the circle the
// viewer names, thirty at a time and more by cursor (protocol §6); "Здесь пока
// тихо" when nobody is speaking, with the radius as the only way to widen.
// Since W2 a card opens full-screen (Card.tsx), "написать" leads to the
// composer and "лайкнутое" to the likes; one's own phrase just sent is named
// over the list with the node's verdict — out, or read by a person first.
// The filters are not here yet.

import { useEffect, useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import type { Sent } from "../api/actions.ts";

export interface FeedCard {
  id: string;
  text: string;
  mode: string;
  lang: string;
  like_count: number;
  // A neighbour's offer: the node nests the discount (routes/feed.ts deliver).
  offer?: { discount_value: string; conditions?: string | null };
  soon?: boolean;
}

export const RADII: Radius[] = [100, 300, 1000, 3000, 10000];
const label = (r: Radius) => (r >= 1000 ? `${r / 1000} км` : `${r} м`);

export function Feed(
  { client, sealed, at, radius, onRadius, onOpen, onWrite, onLikes, sent, gone }: {
    client: Client;
    sealed: "ok" | "failed" | "unlocked";
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

  return (
    <main className="screen feed" data-screen="feed" data-sealed={sealed}>
      <header>
        <h1>Лента</h1>
        <select value={radius} onChange={(e) => onRadius(Number(e.target.value) as Radius)} data-testid="radius">
          {RADII.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
      </header>
      <nav className="actions">
        <button type="button" className="primary" onClick={onWrite} data-testid="write">написать</button>
        <button type="button" onClick={onLikes} data-testid="likes">лайкнутое</button>
      </nav>
      {sent && (
        <p className="warn" data-testid="sent" data-state={sent.state}>
          {sent.state === "published" ? "Ваша фраза вышла: " : "Ваша фраза читается — выйдет после проверки: "}
          «{sent.text}»
        </p>
      )}
      {gone && (
        <p className="muted" data-testid="gone" data-why={gone.why}>
          {gone.why === "hidden" ? "Фраза скрыта из вашей ленты." : "Автор заблокирован: его фраз здесь больше нет."}
        </p>
      )}
      {state === "failed" && <p className="error" data-testid="error">{error}</p>}
      {state === "ready" && items.length === 0 && (
        <section className="empty" data-testid="quiet">
          <h2>Здесь пока тихо</h2>
          <p className="muted">В вашем круге сейчас никто не говорит.</p>
          {radius < 10000 && (
            <button type="button" onClick={() => onRadius(RADII[RADII.indexOf(radius) + 1])}>
              шире круг — {label(RADII[RADII.indexOf(radius) + 1])}
            </button>
          )}
        </section>
      )}
      <ul className="cards" data-testid="cards">
        {items.filter((card) => card.id !== gone?.id).map((card) => (
          <li key={card.id} className="card" data-testid="card" data-id={card.id} onClick={() => onOpen(card)} role="button" tabIndex={0}>
            {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
            <p>{card.text}</p>
            <span className="muted">{card.mode} · {card.lang} · ♥ {card.like_count}{card.soon ? " · скоро исчезнет" : ""}</span>
          </li>
        ))}
      </ul>
      {state === "loading" && <p className="muted skeleton" data-testid="loading">…</p>}
      {next && state === "ready" && (
        <button type="button" onClick={() => load(next)} data-testid="more">показать ещё</button>
      )}
      <footer className="muted">
        ключи: {sealed === "unlocked" ? "отперто ПИНом" : sealed === "ok" ? "печать хранилища сходится" : "печать хранилища не сходится"}
      </footer>
    </main>
  );
}
