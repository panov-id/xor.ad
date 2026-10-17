// neighbro.place — "stickers" (owner's decision 02.10.2026; mockups in
// web/design/gen/dir-stickers), with ONE sticker: the heart. The node knows
// like and unlike only, so the pad holds nothing else. The heart is dragged
// onto the card, or tapped and then the card tapped (Enter and Space do the
// same, WCAG 2.5.7). The like goes to the node 5 s after the heart lands
// (owner's decision 10.10.2026, kit_RU.md §8.5, which replaced the one of
// 04.10.2026): until then an UndoRow says «лайк уйдёт через 5 с · отменить»,
// the clock stands while the focus (or the pointer) is in the row (WCAG 2.2.1),
// and leaving the card sends the like at once. After it has gone, taking it
// back is the likes list's, as on sosed.
// The state and the node's calls are the shared hooks; this file only draws.

import { offerLabel } from "../../ui/offer.ts";
import { useEffect, useId, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { languageIn, likePhrase, modeIcon, modes } from "../../api/actions.ts";
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
import { UndoRow } from "../../ui/Message.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Icon } from "../../ui/Icon.tsx";
import "./stickers.css";
import portScene from "./scenes/port.svg?url";

import { Composer } from "../../screens/Composer.tsx";
import { Chat } from "../../screens/Chat.tsx";
import { Arrival } from "../../screens/Arrival.tsx";
import { Me } from "../../screens/Me.tsx";

// Arrival.svg ("move here"): the arrive sticker, tilted, over the code; the
// code's letters stand in tag cells (stickers.css).
export function ArrivalView(props: ComponentProps<typeof Arrival>) {
  const hero = (
    <div className="sticker-arrive" aria-hidden="true" data-testid="arrival-hero">
      <span className="round-sticker"><Icon name="arrive" size={56} /></span>
    </div>
  );
  return <Arrival {...props} brandClass="b-stickers" hero={hero} />;
}

// Compose.svg: the field as a sticker card, mode and zone as tags (the chosen
// mode in tile-2, the zone in tile-3), the send pill at the foot. Chat.svg:
// own bubbles in tile-4, theirs on the surface. Profile.svg: rows as tags,
// each icon a small round sticker. State is the shared screens'.
export function ComposeView(props: ComponentProps<typeof Composer>) {
  return <Composer {...props} brandClass="b-stickers" />;
}
export function ChatView(props: ComponentProps<typeof Chat>) {
  return <Chat {...props} brandClass="b-stickers" />;
}
export function MeView(props: ComponentProps<typeof Me>) {
  return <Me {...props} brandClass="b-stickers" />;
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

// How long a landed heart waits before the like goes to the node.
const UNDO_S = 5;

// Feed.svg: sticker cards, the white rim and the hard shadow; colours walk
// tile-1..4 with a small lean either way.
function Sticker({ card, index, open }: { card: FeedCard; index: number; open: () => void }) {
  // A venue's offer (sheets adaptive-neighbro-feed, 11.10.2026): the discount as an accent tag stuck on
  // the card, the venue and what, the conditions muted; no mode and no like.
  if (card.offer) return (
    <li className="sticker sticker-offer" data-testid="card" data-id={card.id} data-kind={card.kind === "offer" ? "offer" : undefined}>
      <CardOpen id={card.id} onOpen={open} />
      <span className="ui-offer sticker-offer-tag" data-testid="offer">{offerLabel(card.offer.discount_value)}</span>
      <p id={openerIds(card.id).text} lang={langOf(card)}>{card.offer.venue_name ? `${card.offer.venue_name}: ` : ""}{card.text}</p>
      <span className="sticker-foot" id={openerIds(card.id).foot}>{card.offer.conditions ?? ""}</span>
    </li>
  );
  return (
    <li
      className="sticker"
      data-testid="card"
      data-id={card.id}
      data-index={index}
    >
      <CardOpen id={card.id} onOpen={open} />
      {/* The redesign (concept 15.10.2026, sheet neighbro-feed-375): the landing's card — r0, a 2 px rim,
          a hard shadow; the mode and language as a mono overline, the square «+» and the count at the foot. */}
      <span className="sticker-over ui-icon-row"><Icon name={modeIcon(card.mode)} size={14} />{modeLabel(card.mode)}{languageIn(card.lang) ? ` · ${languageIn(card.lang)}` : ""}{card.soon ? say("web.feed.soon") : ""}</span>
      <p id={openerIds(card.id).text} lang={langOf(card)}>{card.text}</p>
      <span className="sticker-foot" id={openerIds(card.id).foot}>
        <span className="sticker-plus" aria-hidden="true">+</span>
        <span className="sticker-likes" data-mine={card.liked ? "" : undefined} data-lit={card.liked ? "" : undefined} data-testid={card.liked ? "liked-mark" : undefined}>{likesOf(card.like_count, card.liked)}</span>
      </span>
    </li>
  );
}

export function FeedView(props: ComponentProps<typeof Feed>) {
  return <Feed {...props} brandClass="b-stickers" listClass="stickers" renderPhrase={(card, index, open) => <Sticker card={card} index={index} open={open} />} />;
}

// Card.svg: the phrase as a big sticker, the heart pad under it.
export function CardView({ client, card, onBack, onGone, onTalk }: ComponentProps<typeof Card>) {
  const logic = useCard({ client, card, onGone });
  const { busy, liked, doLike } = logic;
  const actions = logic;
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const target = useRef<HTMLElement | null>(null);
  // The heart has landed and the like waits UNDO_S seconds for an undo. The ref
  // is what the unmount reads: leaving the card sends the like at once.
  const [pending, setPendingState] = useState(false);
  const pendingRef = useRef(false);
  const setPending = (on: boolean) => { pendingRef.current = on; setPendingState(on); };
  const [cancelled, setCancelled] = useState(false);
  // The clock stands while the focus is in the undo row (not the pointer: see `held`).
  const [focusIn, setFocusIn] = useState(false);
  // Held by focus only (WCAG 2.2.1): the row appears under the pointer that placed the
  // heart, so holding on hover kept a resting mouse's like from ever going (e2e, 10.10).
  const held = focusIn;
  const heartButton = useRef<HTMLButtonElement | null>(null);
  const placed = liked || pending;
  // The article's name is the phrase, its description what else it carries
  // (offer, mode, conditions, the count): aria-label would hide them (P2).
  const ids = useId();
  const described = [card.offer && `${ids}-offer`, `${ids}-meta`, card.offer?.conditions && `${ids}-cond`, `${ids}-count`].filter(Boolean).join(" ");
  // Said once, when the like has gone, or when it was taken back (P3).
  const said = liked && !card.liked ? say("web.card.liked") : cancelled ? say("web.like.cancelled") : "";
  useEffect(() => {
    if (!pending || held) return;
    const timer = setTimeout(() => {
      setPending(false);
      void doLike();
    }, UNDO_S * 1000);
    return () => clearTimeout(timer);
  }, [pending, held]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the card with the like waiting sends it now: the person placed it.
  useEffect(() => () => { if (pendingRef.current) void likePhrase(client, card.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function place() {
    if (placed || busy) return;
    setCancelled(false);
    setPending(true);
  }
  function undo() {
    setPending(false);
    setFocusIn(false);
    setCancelled(true);
    // The row was where the focus stood: it goes back to the heart.
    setTimeout(() => heartButton.current?.focus(), 0);
  }
  // A card hidden while its like waits is not liked.
  function hideCard() {
    setPending(false);
    void actions.hide();
  }

  const heart = {
    onPointerDown(e: ReactPointerEvent<HTMLButtonElement>) {
      if (placed || busy) return;
      press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove(e: ReactPointerEvent<HTMLButtonElement>) {
      const p = press.current;
      if (!p || p.id !== e.pointerId) return;
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;
      p.moved = true;
      setDrag({ x: e.clientX, y: e.clientY });
    },
    onPointerUp(e: ReactPointerEvent<HTMLButtonElement>) {
      const p = press.current;
      press.current = null;
      setDrag(null);
      if (!p || !p.moved) return;
      const box = target.current?.getBoundingClientRect();
      const over = box && e.clientX >= box.left && e.clientX <= box.right && e.clientY >= box.top && e.clientY <= box.bottom;
      // Dropped outside: back to the pad, nothing sent.
      if (over) place();
      // The click that follows a drag is not a tap.
      press.current = { x: 0, y: 0, id: -1, moved: true };
    },
    onPointerCancel() { press.current = null; setDrag(null); },
    onClick() {
      if (press.current?.moved) { press.current = null; return; }
      // A tap (click, Enter, Space) places the heart on the card at once (owner, 14.10.2026).
      place();
    },
  };

  return (
    <Screen name="card" title={say("web.card.phrase")} className="b-stickers" data-id={card.id} data-heart={liked ? "sent" : pending ? "pending" : "pad"}
      header={<HeaderScreen title={say("web.card.phrase")} onBack={onBack} backLabel={say("web.card.back")} action={<CardMore card={card} logic={actions} onHide={hideCard} />} />}>
      <article
        ref={target}
        className="sticker-card"
        data-testid="heart-target"
        aria-labelledby={`${ids}-text`}
        aria-describedby={described}
      >
        {/* The redesign (concept 15.10.2026, sheets neighbro-card-375/1440): the port scene in a frame of its
            own, the mode and language as a mono overline over the phrase. */}
        <img className="sticker-scene" src={portScene} alt="" aria-hidden="true" decoding="async" draggable={false} />
        {card.offer && <span className="ui-offer" id={`${ids}-offer`} data-testid="offer">{offerLabel(card.offer.discount_value)}</span>}
        <span className="sticker-meta sticker-over" id={`${ids}-meta`}>{modeLabel(card.mode)}{languageIn(card.lang) ? ` · ${languageIn(card.lang)}` : ""}{card.soon ? say("web.card.soon") : ""}</span>
        <p className="ui-big" id={`${ids}-text`} data-testid="text" lang={langOf(card)}>{card.text}</p>
        {card.offer?.conditions && <span className="sticker-meta" id={`${ids}-cond`} data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</span>}
        <span className="sticker-count" id={`${ids}-count`} data-testid="like-burst"><Icon name="like" size={18} /><span className="visually-hidden">{say("web.card.likes")} </span>{card.like_count + (liked && !card.liked ? 1 : 0)}</span>
        {placed && <span className="stuck-heart" data-testid="stuck-heart" aria-hidden="true"><Icon name="like" size={40} /></span>}
      </article>
      {/* The actions' column from 1024 (concept: «what now · like it?» over the heart). */}
      <div className="sticker-ask" aria-hidden="true">
        <p className="ui-overline">{say("web.card.what_now")}</p>
        <p className="sticker-ask-title">{say("web.card.like_it")}</p>
      </div>
      {/* Right after the card, so Tab from it finds «отменить» first (WCAG 2.2.1). */}
      {pending && (
        <div
          onFocus={() => setFocusIn(true)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusIn(false); }}
          data-testid="heart-undo-row"
        >
          <UndoRow mark={say("web.like.undo_mark", { n: UNDO_S })} action={{ label: say("web.like.undo"), onSelect: undo, testid: "heart-undo" }} />
        </div>
      )}
      <span className="visually-hidden" role="status" data-testid="heart-said">{said}</span>
      <CardNotes logic={actions} />
      <CardExtras card={card} logic={actions} />
      {/* the capsule at the screen's foot (sheet adaptive-neighbro-card-393: 361×60 at y 755): the heart (hide is behind «…») */}
      <div data-part="foot">
        <CardTalk logic={actions} onTalk={onTalk}>
          <div className="heart-pad">
            <button
              ref={heartButton}
              type="button"
              className={`heart-sticker${placed ? " used" : ""}`}
              aria-label={say("web.card.heart")}
              disabled={placed || busy}
              data-testid="heart"
              {...heart}
            >
              <Icon name="like" size={36} />
            </button>
            {drag && <span className="heart-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y }}><Icon name="like" size={40} /></span>}
          </div>
        </CardTalk>
      </div>
      {/* «how the match works», the landing's words (owner 16.10.2026: keep it on the card), from 1024. */}
      <section className="sticker-match" data-testid="card-match">
        <p className="ui-overline">{say("web.card.match.neighbro.kick")}</p>
        <h2>{say("web.card.match.neighbro.title")}</h2>
        <p>{say("web.card.match.neighbro.text")}</p>
      </section>
    </Screen>
  );
}

export function MatchView(props: ComponentProps<typeof Match>) {
  const { client, keys, row, onAgreed, onWaiting, onBack, onDeclined } = props;
  const logic = useMatch({ client, keys, row, onAgreed, onDeclined });
  const { theirs, waiting, gone } = logic;
  // Sheet adaptive-neighbro-match-393: «offer» in the header, two like marks side by side, the name
  // big under them, the capsule at the foot; the phrase that matched is a quiet line, not a card.
  return (
    <Screen name="match" title={`${row.name}, ${row.age}`} className="b-stickers" data-id={row.id} data-waiting={waiting ? "yes" : "no"} data-gone={gone ? "yes" : "no"}
      header={<HeaderScreen title={say("web.inbox.offer")} onBack={onBack} backLabel={say("common.back")} />}>
      <MatchHero row={row} end={theirs.expires_at} />
      <MatchBody row={row} keys={keys} logic={logic} onBack={onBack} onWaiting={onWaiting} />
    </Screen>
  );
}
