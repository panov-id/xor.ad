// "Liked" (§4.10, depth's Liked screen): what I liked that is still alive,
// newest first, thirty at a time by cursor. A liked phrase leaves the feed,
// so this is where a like is taken back from — unless a match came of it: the
// node answers `spent`, and a private author's offer cannot be taken back at
// all. A phrase that became a match leads to the inbox, which the web face
// does not have yet: it is named, not linked.

import { useEffect, useState } from "react";
import type { Client, Liked } from "../../../depth/core/client.ts";
import { likedPhrases, unlikePhrase } from "../api/actions.ts";

export function Likes({ client, onBack }: { client: Client; onBack: () => void }) {
  const [items, setItems] = useState<Liked[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState<Record<string, true>>({});

  async function load(after?: string) {
    setState("loading");
    try {
      const page = await likedPhrases(client, after);
      setItems((was) => (after ? [...was, ...page.items] : page.items));
      setNext(page.next);
      setState("ready");
    } catch (e) {
      setError((e as Error).message);
      setState("failed");
    }
  }
  useEffect(() => { void load(); }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  async function takeBack(item: Liked) {
    const outcome = await unlikePhrase(client, item.id);
    if (outcome === "unliked") setItems((was) => was.filter((i) => i.id !== item.id));
    else if (outcome === "spent") setSpent((was) => ({ ...was, [item.id]: true }));
    else setError("Не получилось снять лайк. Повторите.");
  }

  const when = (seconds: number) => new Date(seconds * 1000).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  return (
    <main className="screen likes" data-screen="likes">
      <header>
        <h1>Лайкнутое</h1>
        <button type="button" onClick={onBack} data-testid="back">← лента</button>
      </header>
      {error && <p className="error" data-testid="error">{error}</p>}
      {state === "ready" && items.length === 0 && (
        <section className="empty" data-testid="quiet">
          <h2>Пока ничего</h2>
          <p className="muted">Лайкнутые фразы соберутся здесь, пока живы.</p>
        </section>
      )}
      <ul className="cards" data-testid="liked">
        {items.map((item) => (
          <li key={item.id} className="card" data-testid="liked-card" data-id={item.id}>
            {item.offer && <span className="offer">−{item.offer.discount_value}</span>}
            <p>{item.text}</p>
            <span className="muted">
              ♥ {item.like_count} · {when(item.liked_at)}
              {item.state === "matched" ? " · мэтч — во входящих" : ""}
            </span>
            {item.state === "liked" && !item.offer && !spent[item.id] && (
              <button type="button" onClick={() => takeBack(item)} data-testid="unlike">вернуть лайк</button>
            )}
            {spent[item.id] && <span className="muted" data-testid="spent">лайк уже дал мэтч — не вернуть</span>}
          </li>
        ))}
      </ul>
      {state === "loading" && <p className="muted skeleton" data-testid="loading">…</p>}
      {next && state === "ready" && <button type="button" onClick={() => load(next)} data-testid="more">показать ещё</button>}
    </main>
  );
}
