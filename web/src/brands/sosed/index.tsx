// sosed.place — "blocks" (owner's decision 02.10.2026; mockups in
// web/design/gen/dir-blocks): flat colour tiles from the theme's --tile-1..4
// with their -ink, the big card in --accent with --accent-fg, and three
// gestures on it — swipe right like, swipe left hide, pull down the details —
// each with its button under the card. The state and the node's calls are
// the shared hooks (screens/logic); this file only draws.

import { useState, type ComponentProps } from "react";
import { modes } from "../../api/actions.ts";
import { say } from "../../locales/say.ts";
import { Feed, type FeedCard } from "../../screens/Feed.tsx";
import { Card, CardExtras, CardNotes } from "../../screens/Card.tsx";
import { Life, Match, MatchBody } from "../../screens/Match.tsx";
import { useCard } from "../../screens/logic/useCard.ts";
import { useMatch } from "../../screens/logic/useMatch.ts";
import { Button } from "../../ui/Button.tsx";
import { HeaderScreen } from "../../ui/Header.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { useSwipe } from "../../ui/useSwipe.ts";
import "./blocks.css";

export { Composer as ComposeView } from "../../screens/Composer.tsx";
export { Chat as ChatView } from "../../screens/Chat.tsx";
export { Arrival as ArrivalView } from "../../screens/Arrival.tsx";

const modeLabel = (mode: string) => modes().find((m) => m.value === mode)?.label ?? mode;
const langOf = (card: FeedCard) => (card.lang && card.lang !== "und" ? card.lang : undefined);

// Feed.svg: a wide tile, then two columns; the colours walk tile-1..4.
function Tile({ card, index, open }: { card: FeedCard; index: number; open: () => void }) {
  const wide = index % 5 === 0;
  return (
    <li
      className={`tile tile-c${(index % 4) + 1}${wide ? " tile-wide" : ""}`}
      data-testid="card"
      data-id={card.id}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), open())}
    >
      {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
      <p lang={langOf(card)}>{card.text}</p>
      <span className="tile-foot">
        <span>{modeLabel(card.mode)}{langOf(card) ? ` · ${card.lang}` : ""}{card.soon ? say("web.feed.soon") : ""}</span>
        <span className="tile-likes"><Icon name="like" size={18} />{card.like_count}</span>
      </span>
    </li>
  );
}

export function FeedView(props: ComponentProps<typeof Feed>) {
  return <Feed {...props} brandClass="b-blocks" listClass="tiles" renderPhrase={(card, index, open) => <Tile card={card} index={index} open={open} />} />;
}

// Card.svg: the next tile peeking behind, the card in the accent with a
// grab handle, and under it hide · details · like. Pull down (or ↓) opens
// the details; ↑ closes them.
export function CardView({ client, card, onBack, onGone }: ComponentProps<typeof Card>) {
  const logic = useCard({ client, card, onGone });
  const { busy, liked, doLike, hide } = logic;
  const [peek, setPeek] = useState(false);
  const { bind, offset } = useSwipe({
    onRight: () => { if (!liked) void doLike(); },
    onLeft: () => void hide(),
    onDown: () => setPeek(true),
    disabled: busy,
  });
  const lean = Math.max(-12, Math.min(12, offset.dx / 12));
  return (
    <main className="screen card-screen b-blocks" data-screen="card" data-id={card.id}>
      <HeaderScreen title={modeLabel(card.mode)} onBack={onBack} backLabel={say("web.card.back")} />
      <div className="block-stack">
        <div className="block-behind" aria-hidden="true" />
        <article
          className="block-card"
          data-testid="swipe-card"
          data-liked={liked ? "yes" : "no"}
          aria-label={`${say("web.card.phrase")}: ${card.text}`}
          style={{ transform: `translate(${offset.dx}px, ${offset.dy}px) rotate(${lean}deg)` }}
          {...bind}
        >
          <span className="block-grip" aria-hidden="true" />
          {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
          <p className="big" data-testid="text" lang={langOf(card)}>{card.text}</p>
          <span className="block-mode"><Icon name="me" />{modeLabel(card.mode)}</span>
          {card.soon && <span className="block-soon">{say("web.card.soon")}</span>}
        </article>
      </div>
      {peek && (
        <section className="block-peek" data-testid="details">
          <p><Icon name="like" size={18} /> <span data-testid="like-burst">{card.like_count + (liked ? 1 : 0)}</span></p>
          {langOf(card) && <p lang={langOf(card)}>{card.lang}</p>}
          {card.offer?.conditions && <p data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
        </section>
      )}
      {!peek && card.offer?.conditions && <p className="muted" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
      <CardNotes logic={logic} />
      <div className="block-actions">
        <Button type="button" icon="hide" className="block-btn" aria-label={say("feed.hide")} disabled={busy} onClick={() => void hide()} data-testid="hide" />
        <Button type="button" icon={peek ? "back" : "open"} className={`block-btn block-peek-btn${peek ? " up" : ""}`} aria-label={say("web.card.details")} aria-expanded={peek}
          onClick={() => setPeek((p) => !p)} data-testid="peek" />
        <Button type="button" icon="like" className="block-btn block-like" aria-label={say("web.card.like")} disabled={busy || liked} onClick={() => void doLike()} data-testid="like" />
      </div>
      <div className="actions ui-icon-row card-actions">
        <CardExtras card={card} logic={logic} />
      </div>
    </main>
  );
}

// Match.svg: two tilted tiles, the accent medallion with a surface ring and
// the heart over them; then the cards and the shared body.
export function MatchView(props: ComponentProps<typeof Match>) {
  const { client, keys, row, onAgreed, onWaiting, onBack, onDeclined } = props;
  const logic = useMatch({ client, keys, row, onAgreed, onDeclined });
  const { theirs, mine, waiting, gone } = logic;
  return (
    <main className="screen match b-blocks" data-screen="match" data-id={row.id} data-waiting={waiting ? "yes" : "no"} data-gone={gone ? "yes" : "no"}>
      <HeaderScreen title={`${row.name}, ${row.age}`} onBack={onBack} backLabel={say("common.back")} />
      <div className="block-hero" data-testid="match-hero" aria-hidden="true">
        <span className="hero-tile hero-tile-a" />
        <span className="hero-tile hero-tile-b" />
        <span className="hero-medal"><Icon name="like" size={56} /></span>
      </div>
      {mine && <section className="block-quote block-mine" data-testid="match-mine"><p>{mine.text}</p><Life end={mine.expires_at} tone="mine" /></section>}
      <section className="block-quote match-card">
        <strong>{row.name}, {row.age}</strong>
        <span className="muted">{modeLabel(row.phrase.mode)}</span>
        <p>{row.phrase.text}</p>
        <Life end={theirs.expires_at} tone="theirs" />
      </section>
      <MatchBody row={row} keys={keys} logic={logic} onBack={onBack} onWaiting={onWaiting} />
    </main>
  );
}
