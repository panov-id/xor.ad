// A phrase full-screen (the card of screen 03's sheet, depth's full-screen
// card): the text large, the mode and the language under it, and
// the three things one can do with somebody else's phrase — like (§8.4), hide
// it from one's own feed (§8.9), block its author (§8.9). A like that meets a
// like becomes a match and says so; hiding and blocking take the card away
// and lead back to the feed. Blocking asks twice and names the consequence,
// as the terminal does.

import { useState } from "react";
import type { Client } from "../../../depth/core/client.ts";
import { blockByPhrase, hidePhrase, likePhrase, type LikeOutcome } from "../api/actions.ts";
import type { FeedCard } from "./Feed.tsx";

export function Card(
  { client, card, onBack, onGone }: {
    client: Client;
    card: FeedCard;
    onBack: () => void;
    // The card left the viewer's feed — hidden, or its author blocked.
    onGone: (why: "hidden" | "blocked", id: string) => void;
  },
) {
  const [like, setLike] = useState<LikeOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A venue's offer (W12; offers spec §3, §10.2): "the discount was not
  // given", with an address — the only way to send the decision back.
  const [complaining, setComplaining] = useState(false);
  const [email, setEmail] = useState("");
  const [text, setText] = useState("");
  const [complained, setComplained] = useState(false);

  async function complain() {
    await act(async () => {
      const answer = await client.request<{ error?: { message?: string } }>(
        "POST", `/offers/${encodeURIComponent(card.id)}/complaints`, { notifier_email: email.trim(), text: text.trim() },
      );
      if (answer.status !== 202) throw new Error(answer.body?.error?.message ?? `Жалоба не принята (${answer.status}).`);
      setComplained(true);
      setComplaining(false);
    });
  }

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen card-screen" data-screen="card" data-id={card.id}>
      <header>
        <button type="button" onClick={onBack} data-testid="back">← лента</button>
        <span className="muted">{card.mode} · {card.lang}</span>
      </header>
      <article className="phrase">
        {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
        <p className="big" data-testid="text">{card.text}</p>
        {card.offer?.conditions && <p className="muted" data-testid="conditions">условия: {card.offer.conditions}</p>}
        <p className="muted">
          ♥ {card.like_count + (like && like.state !== "refused" ? 1 : 0)}
          {card.soon ? " · скоро исчезнет" : ""}
        </p>
      </article>
      {like?.state === "liked" && <p className="warn" data-testid="liked">Лайк отправлен. Если понравитесь друг другу — будет мэтч.</p>}
      {like?.state === "matched" && <p className="warn" data-testid="matched">Мэтч! Предложение поговорить ждёт во входящих.</p>}
      {like?.state === "refused" && <p className="error" data-testid="refused">{like.why}</p>}
      {error && <p className="error" data-testid="error">{error}</p>}
      <div className="actions">
        <button
          type="button"
          className="primary"
          disabled={busy || (like !== null && like.state !== "refused")}
          onClick={() => act(async () => setLike(await likePhrase(client, card.id)))}
          data-testid="like"
        >
          ♥ нравится
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => act(async () => { await hidePhrase(client, card.id); onGone("hidden", card.id); })}
          data-testid="hide"
        >
          скрыть
        </button>
        {card.kind === "offer" && (complained
          ? <p data-testid="complained">Жалоба отправлена. Решение придёт на почту.</p>
          : !complaining
          ? <button type="button" disabled={busy} onClick={() => setComplaining(true)} data-testid="complain">скидку не дали</button>
          : (
            <section className="confirm" data-testid="complain-form">
              <label>
                почта — туда придёт решение
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="complain-email" autoComplete="email" />
              </label>
              <label>
                что случилось
                <textarea value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} data-testid="complain-text" />
              </label>
              <button type="button" className="danger" disabled={busy || !email.includes("@")} onClick={() => void complain()} data-testid="complain-send">пожаловаться</button>
              <button type="button" onClick={() => setComplaining(false)}>{"отмена"}</button>
            </section>
          ))}
        {!confirmBlock
          ? (
            <button type="button" disabled={busy} onClick={() => setConfirmBlock(true)} data-testid="block">
              заблокировать
            </button>
          )
          : (
            <section className="confirm" data-testid="block-confirm">
              <p className="muted">Автор исчезнет из вашей ленты, а вы — из его. Общие мэтчи и беседы закончатся. Снять можно в «заблокированных».</p>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => act(async () => { await blockByPhrase(client, card.id); onGone("blocked", card.id); })}
                data-testid="block-confirm-yes"
              >
                да, заблокировать
              </button>
              <button type="button" onClick={() => setConfirmBlock(false)} data-testid="block-confirm-no">нет</button>
            </section>
          )}
      </div>
    </main>
  );
}
