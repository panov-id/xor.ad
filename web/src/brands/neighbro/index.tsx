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

import { useEffect, useId, useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { languageIn, likePhrase, modes } from "../../api/actions.ts";
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
import { UndoRow } from "../../ui/Message.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Icon } from "../../ui/Icon.tsx";
import "./stickers.css";

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
const likesOf = (n: number) => (
  <>
    <Icon name="like" size={18} />
    <span aria-hidden="true">{n}</span>
    <span className="visually-hidden">{say("web.like.count", { n })}</span>
  </>
);

// How long a landed heart waits before the like goes to the node.
const UNDO_S = 5;

// Feed.svg: sticker cards, the white rim and the hard shadow; colours walk
// tile-1..4 with a small lean either way.
function Sticker({ card, index, open }: { card: FeedCard; index: number; open: () => void }) {
  return (
    <li
      className={`sticker sticker-c${(index % 4) + 1}${index % 2 ? " lean-r" : " lean-l"}`}
      data-testid="card"
      data-id={card.id}
    >
      <CardOpen id={card.id} onOpen={open} />
      {card.offer && <span className="ui-offer" data-testid="offer">−{card.offer.discount_value}</span>}
      <p id={openerIds(card.id).text} lang={langOf(card)}>{card.text}</p>
      <span className="sticker-foot" id={openerIds(card.id).foot}>
        <span>{modeLabel(card.mode)}{languageIn(card.lang) ? ` · ${languageIn(card.lang)}` : ""}{card.soon ? say("web.feed.soon") : ""}</span>
        <span className="sticker-likes">{likesOf(card.like_count)}</span>
      </span>
    </li>
  );
}

export function FeedView(props: ComponentProps<typeof Feed>) {
  return <Feed {...props} brandClass="b-stickers" listClass="stickers" renderPhrase={(card, index, open) => <Sticker card={card} index={index} open={open} />} />;
}

// Card.svg: the phrase as a big sticker, the heart pad under it.
export function CardView({ client, card, onBack, onGone }: ComponentProps<typeof Card>) {
  const logic = useCard({ client, card, onGone });
  const { busy, liked, doLike } = logic;
  const actions = logic;
  const [armed, setArmed] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const target = useRef<HTMLElement | null>(null);
  // The heart has landed and the like waits UNDO_S seconds for an undo. The ref
  // is what the unmount reads: leaving the card sends the like at once.
  const [pending, setPendingState] = useState(false);
  const pendingRef = useRef(false);
  const setPending = (on: boolean) => { pendingRef.current = on; setPendingState(on); };
  const [cancelled, setCancelled] = useState(false);
  // The clock stands while the focus or the pointer is in the undo row.
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
  const said = liked ? say("web.card.liked") : cancelled ? say("web.like.cancelled") : "";
  // A picked heart sends focus to its target, which sits before it (P4).
  useEffect(() => { if (armed) target.current?.focus(); }, [armed]);
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
    setArmed(false);
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
      if (!placed) setArmed((a) => !a);
    },
  };

  return (
    <Screen name="card" title={say("web.card.phrase")} className="b-stickers" data-id={card.id} data-heart={liked ? "sent" : pending ? "pending" : armed ? "armed" : "pad"}
      header={<HeaderScreen title={say("web.card.phrase")} onBack={onBack} backLabel={say("web.card.back")} />}>
      <article
        ref={target}
        className={`sticker-card${armed ? " target" : ""}`}
        data-testid="heart-target"
        role="button"
        tabIndex={armed ? 0 : -1}
        aria-labelledby={`${ids}-text`}
        aria-describedby={described}
        aria-disabled={!armed}
        onClick={() => { if (armed) place(); }}
        onKeyDown={(k) => { if (armed && (k.key === "Enter" || k.key === " ")) { k.preventDefault(); place(); } }}
      >
        {card.offer && <span className="ui-offer" id={`${ids}-offer`} data-testid="offer">−{card.offer.discount_value}</span>}
        <p className="ui-big" id={`${ids}-text`} data-testid="text" lang={langOf(card)}>{card.text}</p>
        <span className="sticker-meta" id={`${ids}-meta`}>{modeLabel(card.mode)}{card.soon ? say("web.card.soon") : ""}</span>
        {card.offer?.conditions && <span className="sticker-meta" id={`${ids}-cond`} data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</span>}
        <span className="sticker-count" id={`${ids}-count`} data-testid="like-burst"><Icon name="like" size={18} /><span className="visually-hidden">{say("web.card.likes")} </span>{card.like_count + (liked ? 1 : 0)}</span>
        {placed && <span className="stuck-heart" data-testid="stuck-heart" aria-hidden="true"><Icon name="like" size={40} /></span>}
      </article>
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
      <div className="heart-pad">
        <button
          ref={heartButton}
          type="button"
          className={`heart-sticker${armed ? " armed" : ""}${placed ? " used" : ""}`}
          aria-label={say("web.card.heart")}
          aria-pressed={armed}
          disabled={placed || busy}
          data-testid="heart"
          {...heart}
        >
          <Icon name="like" size={36} />
        </button>
        {drag && <span className="heart-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y }}><Icon name="like" size={40} /></span>}
        <Button type="button" icon="hide" aria-label={say("feed.hide")} disabled={busy} onClick={hideCard} data-testid="hide" />
      </div>
      <Actions>
        <CardExtras card={card} logic={actions} />
      </Actions>
    </Screen>
  );
}

// Match.svg: two hearts over the two phrases.
export function MatchView(props: ComponentProps<typeof Match>) {
  const { client, keys, row, onAgreed, onWaiting, onBack, onDeclined } = props;
  const logic = useMatch({ client, keys, row, onAgreed, onDeclined });
  const { theirs, mine, waiting, gone } = logic;
  return (
    <Screen name="match" title={`${row.name}, ${row.age}`} className="b-stickers" data-id={row.id} data-waiting={waiting ? "yes" : "no"} data-gone={gone ? "yes" : "no"}
      header={<HeaderScreen title={`${row.name}, ${row.age}`} onBack={onBack} backLabel={say("common.back")} />}>
      <div className="sticker-hero" data-testid="match-hero" aria-hidden="true">
        <span className="hero-heart hero-heart-a"><Icon name="like" size={64} /></span>
        <span className="hero-heart hero-heart-b"><Icon name="like" size={64} /></span>
      </div>
      {mine && (
        <section className="sticker-quote" data-part="mine" data-testid="match-mine">
          <p>{mine.text}</p>
          <Life end={mine.expires_at} tone="mine" />
        </section>
      )}
      <section className="sticker-quote" data-part="theirs">
        <strong>{row.name}, {row.age}</strong>
        <span className="ui-hint">{modeLabel(row.phrase.mode)}</span>
        <p>{row.phrase.text}</p>
        <Life end={theirs.expires_at} tone="theirs" />
      </section>
      <MatchBody row={row} keys={keys} logic={logic} onBack={onBack} onWaiting={onWaiting} />
    </Screen>
  );
}
