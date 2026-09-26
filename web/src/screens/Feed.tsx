// Screen 03 (panel/design/sheets/screen-03.svg): the cards of the circle the
// viewer names, thirty at a time and more by cursor (protocol §6); "Здесь пока
// тихо" when nobody is speaking, with the radius as the only way to widen.
// The filters, the composer and the likes are not here yet (W1).

import { useEffect, useState } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";

interface Card {
  id: string;
  text: string;
  mode: string;
  lang: string;
  like_count: number;
  discount_value?: string | null;
  conditions?: string | null;
  soon?: boolean;
}

const RADII: Radius[] = [100, 300, 1000, 3000, 10000];
const label = (r: Radius) => (r >= 1000 ? `${r / 1000} км` : `${r} м`);

export function Feed({ client, sealed }: { client: Client; sealed: "ok" | "failed" }) {
  // The area is placed anywhere, by the person (§8.3); until the place picker
  // of the sheet is drawn it is one fixed point.
  const [at] = useState({ lat: 41.9, lon: 12.5 });
  const [radius, setRadius] = useState<Radius>(1000);
  const [items, setItems] = useState<Card[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  async function load(after?: string) {
    setState("loading");
    try {
      const page = await client.feed({ ...at, radius, after });
      setItems((was) => (after ? [...was, ...(page.items as Card[])] : (page.items as Card[])));
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
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value) as Radius)} data-testid="radius">
          {RADII.map((r) => <option key={r} value={r}>{label(r)}</option>)}
        </select>
      </header>
      {state === "failed" && <p className="error" data-testid="error">{error}</p>}
      {state === "ready" && items.length === 0 && (
        <section className="empty" data-testid="quiet">
          <h2>Здесь пока тихо</h2>
          <p className="muted">В вашем круге сейчас никто не говорит.</p>
          {radius < 10000 && (
            <button type="button" onClick={() => setRadius(RADII[RADII.indexOf(radius) + 1])}>
              шире круг — {label(RADII[RADII.indexOf(radius) + 1])}
            </button>
          )}
        </section>
      )}
      <ul className="cards" data-testid="cards">
        {items.map((card) => (
          <li key={card.id} className="card" data-testid="card">
            {card.discount_value && <span className="offer">−{card.discount_value}</span>}
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
        ключи: печать хранилища {sealed === "ok" ? "сходится" : "не сходится"}
      </footer>
    </main>
  );
}
