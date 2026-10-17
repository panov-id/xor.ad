// sosed.place — "blocks" (owner's decision 02.10.2026; mockups in
// web/design/gen/dir-blocks): flat colour tiles from the theme's --tile-1..4
// with their -ink, the big card in --accent with --accent-fg, and three
// gestures on it — swipe right like, swipe left hide, pull down the details —
// each with its button under the card. The state and the node's calls are
// the shared hooks (screens/logic); this file only draws.

import { offerLabel } from "../../ui/offer.ts";
import { useState, type ComponentProps } from "react";
import { languageIn, modeIcon, modes } from "../../api/actions.ts";
import { say } from "../../locales/say.ts";
import { Feed, type FeedCard } from "../../screens/Feed.tsx";
import { CardOpen, openerIds } from "../../ui/Card.tsx";
import { Card, CardExtras, CardMore, CardNotes, CardTalk } from "../../screens/Card.tsx";
import { Match, MatchBody, MatchHero } from "../../screens/Match.tsx";
import { useCard } from "../../screens/logic/useCard.ts";
import { useMatch } from "../../screens/logic/useMatch.ts";
import { Button } from "../../ui/Button.tsx";
import { HeaderScreen } from "../../ui/Header.tsx";
import { Actions } from "../../ui/Links.tsx";
import { Split } from "../../ui/Split.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { useSwipe } from "../../ui/useSwipe.ts";
import "./blocks.css";
import portScene from "./scenes/port.svg?url";

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
const likesOf = (n: number, mine?: boolean) => (
  <>
    <Icon name="like" size={18} />
    <span aria-hidden="true">{n}</span>
    <span className="visually-hidden">{say("web.like.count", { n })}{mine ? `, ${say("web.feed.liked")}` : ""}</span>
  </>
);

// Feed.svg: a wide tile, then two columns; the colours walk tile-1..4.
function Tile({ card, index, open }: { card: FeedCard; index: number; open: () => void }) {
  // A venue's offer (sheets adaptive-sosed-feed, 11.10.2026): on the surface, the discount big in
  // accent-text, the venue and what, the conditions small; no mode and no like — it is no neighbour's phrase.
  if (card.offer) return (
    <li className="tile tile-offer" data-testid="card" data-id={card.id} data-kind={card.kind === "offer" ? "offer" : undefined}>
      <CardOpen id={card.id} onOpen={open} />
      <span className="ui-offer tile-offer-value" data-testid="offer">{offerLabel(card.offer.discount_value)}</span>
      <p id={openerIds(card.id).text} lang={langOf(card)}>{card.offer.venue_name ? `${card.offer.venue_name}: ` : ""}{card.text}</p>
      <span className="tile-foot ui-hint" id={openerIds(card.id).foot}>{card.offer.conditions ?? ""}</span>
    </li>
  );
  return (
    <li
      className="tile"
      data-testid="card"
      data-id={card.id}
      data-index={index}
    >
      <CardOpen id={card.id} onOpen={open} />
      {/* The redesign (concept 15.10.2026, sheet sosed-feed-375): paper, the mode and language as a mono
          overline on top, the phrase, then the landing's round «+» and the count in mono at the foot. */}
      <span className="tile-over ui-icon-row"><Icon name={modeIcon(card.mode)} size={14} />{modeLabel(card.mode)}{languageIn(card.lang) ? ` · ${languageIn(card.lang)}` : ""}{card.soon ? say("web.feed.soon") : ""}</span>
      <p id={openerIds(card.id).text} lang={langOf(card)}>{card.text}</p>
      <span className="tile-foot" id={openerIds(card.id).foot}>
        <span className="tile-plus" aria-hidden="true">+</span>
        <span className="tile-likes" data-mine={card.liked ? "" : undefined} data-lit={card.liked ? "" : undefined} data-testid={card.liked ? "liked-mark" : undefined}>{likesOf(card.like_count, card.liked)}</span>
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
export function CardView({ client, card, onBack, onGone, onTalk }: ComponentProps<typeof Card>) {
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
      header={
        <HeaderScreen title={say("web.card.phrase")} onBack={onBack} backLabel={say("web.card.back")} action={
          /* «…» holds block, complaint, link report (card-more.svg); the details toggle is the swipe-down's button twin. */
          <span className="ui-icon-row">
            <Button type="button" icon={peek ? "back" : "open"} className={`block-peek-btn ui-plain${peek ? " up" : ""}`} aria-label={say("web.card.details")} aria-expanded={peek}
              onClick={() => setPeek((p) => !p)} data-testid="peek" />
            <CardMore card={card} logic={logic} />
          </span>
        } />
      }>
      {/* Card-more.svg: the details are a panel of tiles above the card, icon
          and value each — only what the node sends (no distance, no clock). */}
      {peek && (
        <section className="block-peek" data-testid="details" aria-label={say("web.card.details")}>
          <ul className="block-peek-tiles" role="list">
            <li className="block-peek-tile t2"><Icon name={modeIcon(card.mode)} /><span>{modeLabel(card.mode)}</span></li>
            <li className="block-peek-tile t1"><Icon name="like" /><span data-testid="like-burst" aria-hidden="true">{card.like_count + (liked && !card.liked ? 1 : 0)}</span><span className="visually-hidden">{say("web.like.count", { n: card.like_count + (liked && !card.liked ? 1 : 0) })}</span></li>
            {languageIn(card.lang) && <li className="block-peek-tile t3"><Icon name="say" /><span lang={langOf(card)}>{languageIn(card.lang)}</span></li>}
            {card.soon && <li className="block-peek-tile t4"><Icon name="timer" /><span>{say("web.card.soon")}</span></li>}
          </ul>
          {card.offer?.conditions && <p data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
        </section>
      )}
      <div className="block-stack">
        <article
          className="block-card"
          data-testid="swipe-card"
          data-liked={liked ? "yes" : "no"}
          aria-label={`${say("web.card.phrase")}: ${card.text}`}
          style={{ transform: `translate(${offset.dx}px, ${offset.dy}px) rotate(${lean}deg)` }}
          {...bind}
        >
          {/* The redesign (concept 15.10.2026, sheets sosed-card-375/1440): paper with the old port's scene as a
              strip melting into it, the mode and language as an overline, the phrase large, the likes in mono. */}
          <img className="block-scene" src={portScene} alt="" aria-hidden="true" decoding="async" draggable={false} />
          {card.offer && <span className="ui-offer" data-testid="offer">{offerLabel(card.offer.discount_value)}</span>}
          <span className="block-over ui-icon-row"><Icon name={modeIcon(card.mode)} size={14} />{modeLabel(card.mode)}{languageIn(card.lang) ? ` · ${languageIn(card.lang)}` : ""}</span>
          <p className="ui-big" data-testid="text" lang={langOf(card)}>{card.text}</p>
          {card.soon && <span className="block-soon">{say("web.card.soon")}</span>}
          <span className="block-count">{say("web.like.count", { n: card.like_count + (liked && !card.liked ? 1 : 0) })}</span>
        </article>
      </div>
      {/* The actions' column from 1024 (concept: «what now · like it?» over the like). */}
      <div className="block-ask" aria-hidden="true">
        <p className="ui-overline">{say("web.card.what_now")}</p>
        <p className="block-ask-title">{say("web.card.like_it")}</p>
      </div>
      {!peek && card.offer?.conditions && <p className="ui-hint" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
      <CardNotes logic={logic} />
      <CardExtras card={card} logic={logic} />
      {/* the capsule at the screen's foot (sheet adaptive-sosed-card-393: y 755 of 851) */}
      <div data-part="foot">
        <CardTalk logic={logic} onTalk={onTalk}>
          <Split>
            <Button type="button" kind="primary" icon="like" aria-label={say("web.card.like")} disabled={busy || liked} onClick={() => void doLike()} data-testid="like" data-lit={liked ? "" : undefined} aria-pressed={liked} />
          </Split>
        </CardTalk>
      </div>
      {/* the gestures' hint under the like (sheets sosed-card-375 y 578, -1440 y 356) */}
      <p className="block-gestures" data-testid="card-gestures">{say("web.card.gestures")}</p>
      {/* «how the match works», the landing's words (owner 16.10.2026: keep it on the card), from 1024. */}
      <section className="block-match" data-testid="card-match">
        <p className="ui-overline">{say("web.card.match.sosed.kick")}</p>
        <h2>{say("web.card.match.sosed.title")}</h2>
        <p>{say("web.card.match.sosed.text")}</p>
      </section>
    </Screen>
  );
}

export function MatchView(props: ComponentProps<typeof Match>) {
  const { client, keys, row, onAgreed, onWaiting, onBack, onDeclined } = props;
  const logic = useMatch({ client, keys, row, onAgreed, onDeclined });
  const { theirs, waiting, gone } = logic;
  // Sheet adaptive-sosed-match-393: «offer» in the header, two like marks side by side, the name
  // big under them, the capsule at the foot; the phrase that matched is a quiet line, not a card.
  return (
    <Screen name="match" title={`${row.name}, ${row.age}`} className="b-blocks" data-id={row.id} data-waiting={waiting ? "yes" : "no"} data-gone={gone ? "yes" : "no"}
      header={<HeaderScreen title={say("web.inbox.offer")} onBack={onBack} backLabel={say("common.back")} />}>
      <MatchHero row={row} end={theirs.expires_at} />
      <MatchBody row={row} keys={keys} logic={logic} onBack={onBack} onWaiting={onWaiting} />
    </Screen>
  );
}
