// sosed.place — "blocks" (owner's decision 02.10.2026; mockups in
// web/design/gen/dir-blocks): flat colour tiles from the theme's --tile-1..4
// with their -ink, the big card in --accent with --accent-fg, and three
// gestures on it — swipe right like, swipe left hide, pull down the details —
// each with its button under the card. The state and the node's calls are
// the shared hooks (screens/logic); this file only draws.

import { useState, type ComponentProps } from "react";
import { languageIn, modes } from "../../api/actions.ts";
import { say } from "../../locales/say.ts";
import { Feed, type FeedCard } from "../../screens/Feed.tsx";
import { CardOpen, openerIds } from "../../ui/Card.tsx";
import { Card, CardExtras, CardNotes } from "../../screens/Card.tsx";
import { Life, Match, MatchBody } from "../../screens/Match.tsx";
import { useCard } from "../../screens/logic/useCard.ts";
import { useMatch } from "../../screens/logic/useMatch.ts";
import { Button } from "../../ui/Button.tsx";
import { HeaderScreen } from "../../ui/Header.tsx";
import { Actions } from "../../ui/Links.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { useSwipe } from "../../ui/useSwipe.ts";
import "./blocks.css";

import { Composer } from "../../screens/Composer.tsx";
import { Chat } from "../../screens/Chat.tsx";
import { Arrival } from "../../screens/Arrival.tsx";
import { Me } from "../../screens/Me.tsx";

// Arrival.svg: the bento of five tiles over the form — the accent tile with
// the pin, the others in tile-2..4 and surface-2 with their thin icons.
export function ArrivalView(props: ComponentProps<typeof Arrival>) {
  const hero = (
    <div className="block-bento" aria-hidden="true" data-testid="arrival-hero">
      <span className="bento bento-a"><Icon name="pin" size={48} /></span>
      <span className="bento bento-b"><Icon name="say" size={40} /></span>
      <span className="bento bento-c"><Icon name="timer" size={40} /></span>
      <span className="bento bento-d"><Icon name="like" size={40} /></span>
      <span className="bento bento-e"><Icon name="hide" size={40} /></span>
    </div>
  );
  return <Arrival {...props} brandClass="b-blocks" hero={hero} />;
}

// Compose.svg: the field as a surface tile with the focus line, the mode as
// three tiles (the chosen one in tile-1), the zone as pills (tile-3), the
// publish pill in the accent. Chat.svg and Profile.svg likewise: the state is
// the shared screen's, the look is blocks.css.
export function ComposeView(props: ComponentProps<typeof Composer>) {
  return <Composer {...props} brandClass="b-blocks" />;
}
export function ChatView(props: ComponentProps<typeof Chat>) {
  return <Chat {...props} brandClass="b-blocks" />;
}
export function MeView(props: ComponentProps<typeof Me>) {
  return <Me {...props} brandClass="b-blocks" />;
}

const modeLabel = (mode: string) => modes().find((m) => m.value === mode)?.label ?? mode;
const langOf = (card: FeedCard) => (card.lang && card.lang !== "und" ? card.lang : undefined);
// The like count for the eye (the heart and the number) and for the ear (its
// name, «лайков: 3»): a bare number after an icon is read as «три» (П16).
const likesOf = (n: number) => (
  <>
    <Icon name="like" size={18} />
    <span aria-hidden="true">{n}</span>
    <span className="visually-hidden">{say("web.like.count", { n })}</span>
  </>
);

// Feed.svg: a wide tile, then two columns; the colours walk tile-1..4.
function Tile({ card, index, open }: { card: FeedCard; index: number; open: () => void }) {
  const wide = index % 5 === 0;
  return (
    <li
      className={`tile tile-c${(index % 4) + 1}${wide ? " tile-wide" : ""}`}
      data-testid="card"
      data-id={card.id}
    >
      <CardOpen id={card.id} onOpen={open} />
      {card.offer && <span className="ui-offer" data-testid="offer">−{card.offer.discount_value}</span>}
      <p id={openerIds(card.id).text} lang={langOf(card)}>{card.text}</p>
      <span className="tile-foot" id={openerIds(card.id).foot}>
        <span className="ui-icon-row"><Icon name="me" size={16} />{modeLabel(card.mode)}{languageIn(card.lang) ? ` · ${languageIn(card.lang)}` : ""}{card.soon ? say("web.feed.soon") : ""}</span>
        <span className="tile-likes">{likesOf(card.like_count)}</span>
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
    <Screen name="card" title={say("web.card.phrase")} className="b-blocks" data-id={card.id}
      header={<HeaderScreen title={say("web.card.phrase")} onBack={onBack} backLabel={say("web.card.back")} />}>
      {/* Card-more.svg: the details are a panel of tiles above the card, icon
          and value each — only what the node sends (no distance, no clock). */}
      {peek && (
        <section className="block-peek" data-testid="details" aria-label={say("web.card.details")}>
          <ul className="block-peek-tiles" role="list">
            <li className="block-peek-tile t2"><Icon name="me" /><span>{modeLabel(card.mode)}</span></li>
            <li className="block-peek-tile t1"><Icon name="like" /><span data-testid="like-burst">{card.like_count + (liked ? 1 : 0)}</span></li>
            {languageIn(card.lang) && <li className="block-peek-tile t3"><Icon name="say" /><span lang={langOf(card)}>{languageIn(card.lang)}</span></li>}
            {card.soon && <li className="block-peek-tile t4"><Icon name="timer" /><span>{say("web.card.soon")}</span></li>}
          </ul>
          {card.offer?.conditions && <p data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
        </section>
      )}
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
          {card.offer && <span className="ui-offer" data-testid="offer">−{card.offer.discount_value}</span>}
          <p className="ui-big" data-testid="text" lang={langOf(card)}>{card.text}</p>
          <span className="block-mode"><Icon name="me" />{modeLabel(card.mode)}</span>
          {card.soon && <span className="block-soon">{say("web.card.soon")}</span>}
        </article>
      </div>
      {!peek && card.offer?.conditions && <p className="ui-hint" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
      <CardNotes logic={logic} />
      <div className="block-actions">
        <Button type="button" icon="hide" className="block-btn" aria-label={say("feed.hide")} disabled={busy} onClick={() => void hide()} data-testid="hide" />
        <Button type="button" icon={peek ? "back" : "open"} className={`block-btn block-peek-btn${peek ? " up" : ""}`} aria-label={say("web.card.details")} aria-expanded={peek}
          onClick={() => setPeek((p) => !p)} data-testid="peek" />
        <Button type="button" icon="like" className="block-btn block-like" aria-label={say("web.card.like")} disabled={busy || liked} onClick={() => void doLike()} data-testid="like" />
      </div>
      <Actions>
        <CardExtras card={card} logic={logic} />
      </Actions>
    </Screen>
  );
}

// Match.svg: two tilted tiles, the accent medallion with a surface ring and
// the heart over them; then the cards and the shared body.
export function MatchView(props: ComponentProps<typeof Match>) {
  const { client, keys, row, onAgreed, onWaiting, onBack, onDeclined } = props;
  const logic = useMatch({ client, keys, row, onAgreed, onDeclined });
  const { theirs, mine, waiting, gone } = logic;
  return (
    <Screen name="match" title={`${row.name}, ${row.age}`} className="b-blocks" data-id={row.id} data-waiting={waiting ? "yes" : "no"} data-gone={gone ? "yes" : "no"}
      header={<HeaderScreen title={`${row.name}, ${row.age}`} onBack={onBack} backLabel={say("common.back")} />}>
      <div className="block-hero" data-testid="match-hero" aria-hidden="true">
        <span className="hero-tile hero-tile-a" />
        <span className="hero-tile hero-tile-b" />
        <span className="hero-medal"><Icon name="like" size={56} /></span>
      </div>
      {mine && <section className="block-quote block-mine" data-part="mine" data-testid="match-mine"><p>{mine.text}</p><Life end={mine.expires_at} tone="mine" /></section>}
      <section className="block-quote" data-part="theirs">
        <strong>{row.name}, {row.age}</strong>
        <span className="ui-hint">{modeLabel(row.phrase.mode)}</span>
        <p>{row.phrase.text}</p>
        <Life end={theirs.expires_at} tone="theirs" />
      </section>
      <MatchBody row={row} keys={keys} logic={logic} onBack={onBack} onWaiting={onWaiting} />
    </Screen>
  );
}
