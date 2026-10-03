// neighbro.place — "stickers" (owner's decision 02.10.2026; mockups in
// web/design/gen/dir-stickers), with ONE sticker: the heart. The node knows
// like and unlike only, so the pad holds nothing else. The heart is dragged
// onto the card, or tapped and then the card tapped (Enter and Space do the
// same, WCAG 2.5.7); it sits there UNDO_MS before the like is sent, and taking
// it off in that window sends nothing (screens/logic/useDeferredLike.ts).
// The state and the node's calls are the shared hooks; this file only draws.

import { useRef, useState, type ComponentProps, type PointerEvent as ReactPointerEvent } from "react";
import { modes } from "../../api/actions.ts";
import { say } from "../../locales/say.ts";
import { Feed, type FeedCard } from "../../screens/Feed.tsx";
import { Card, CardExtras, CardNotes } from "../../screens/Card.tsx";
import { Life, Match, MatchBody } from "../../screens/Match.tsx";
import { useCard } from "../../screens/logic/useCard.ts";
import { useDeferredLike } from "../../screens/logic/useDeferredLike.ts";
import { useMatch } from "../../screens/logic/useMatch.ts";
import { Button } from "../../ui/Button.tsx";
import { HeaderScreen } from "../../ui/Header.tsx";
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

// Feed.svg: sticker cards, the white rim and the hard shadow; colours walk
// tile-1..4 with a small lean either way.
function Sticker({ card, index, open }: { card: FeedCard; index: number; open: () => void }) {
  return (
    <li
      className={`sticker sticker-c${(index % 4) + 1}${index % 2 ? " lean-r" : " lean-l"}`}
      data-testid="card"
      data-id={card.id}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && (k.preventDefault(), open())}
    >
      {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
      <p lang={langOf(card)}>{card.text}</p>
      <span className="sticker-foot">
        <span>{modeLabel(card.mode)}{langOf(card) ? ` · ${card.lang}` : ""}{card.soon ? say("web.feed.soon") : ""}</span>
        <span className="sticker-likes"><Icon name="like" size={18} />{card.like_count}</span>
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
  const { busy, liked, doLike, hide } = logic;
  const deferred = useDeferredLike(doLike);
  // Hiding or blocking inside the heart's window takes the heart off first:
  // leaving the card would otherwise send the like it was meant to cancel.
  const actions = { ...logic, hide: () => { deferred.undo(); return hide(); }, block: () => { deferred.undo(); return logic.block(); } };
  const [armed, setArmed] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const press = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const placed = deferred.pending || liked;

  function place() {
    if (placed || busy) return;
    setArmed(false);
    deferred.place();
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
    <main className="screen card-screen b-stickers" data-screen="card" data-id={card.id} data-heart={deferred.pending ? "pending" : liked ? "sent" : armed ? "armed" : "pad"}>
      <HeaderScreen title={modeLabel(card.mode)} onBack={onBack} backLabel={say("web.card.back")} />
      <article
        ref={target}
        className={`sticker-card${armed ? " target" : ""}`}
        data-testid="heart-target"
        role="button"
        tabIndex={0}
        aria-label={`${say("web.card.phrase")}: ${card.text}`}
        aria-disabled={!armed}
        onClick={() => { if (armed) place(); }}
        onKeyDown={(k) => { if (armed && (k.key === "Enter" || k.key === " ")) { k.preventDefault(); place(); } }}
      >
        {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
        <p className="big" data-testid="text" lang={langOf(card)}>{card.text}</p>
        <span className="sticker-meta">{modeLabel(card.mode)}{card.soon ? say("web.card.soon") : ""}</span>
        {card.offer?.conditions && <span className="sticker-meta" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</span>}
        <span className="sticker-count" data-testid="like-burst"><Icon name="like" size={18} />{card.like_count + (liked ? 1 : 0)}</span>
        {placed && <span className="stuck-heart" data-testid="stuck-heart" aria-hidden="true"><Icon name="like" size={40} /></span>}
      </article>
      {deferred.pending && (
        <p className="warn heart-wait" role="status" data-testid="heart-wait">
          {say("web.card.heart_wait", { n: deferred.left })}
          <Button type="button" icon="close" aria-label={say("liked.undo")} onClick={deferred.undo} data-testid="heart-undo" />
        </p>
      )}
      <CardNotes logic={actions} />
      <div className="heart-pad">
        <button
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
        <Button type="button" icon="hide" aria-label={say("feed.hide")} disabled={busy} onClick={() => void actions.hide()} data-testid="hide" />
      </div>
      <div className="actions ui-icon-row card-actions">
        <CardExtras card={card} logic={actions} />
      </div>
    </main>
  );
}

// Match.svg: two hearts over the two phrases.
export function MatchView(props: ComponentProps<typeof Match>) {
  const { client, keys, row, onAgreed, onWaiting, onBack, onDeclined } = props;
  const logic = useMatch({ client, keys, row, onAgreed, onDeclined });
  const { theirs, mine, waiting, gone } = logic;
  return (
    <main className="screen match b-stickers" data-screen="match" data-id={row.id} data-waiting={waiting ? "yes" : "no"} data-gone={gone ? "yes" : "no"}>
      <HeaderScreen title={`${row.name}, ${row.age}`} onBack={onBack} backLabel={say("common.back")} />
      <div className="sticker-hero" data-testid="match-hero" aria-hidden="true">
        <span className="hero-heart hero-heart-a"><Icon name="like" size={64} /></span>
        <span className="hero-heart hero-heart-b"><Icon name="like" size={64} /></span>
      </div>
      {mine && (
        <section className="sticker-quote" data-testid="match-mine">
          <p>{mine.text}</p>
          <Life end={mine.expires_at} tone="mine" />
        </section>
      )}
      <section className="sticker-quote match-card">
        <strong>{row.name}, {row.age}</strong>
        <span className="muted">{modeLabel(row.phrase.mode)}</span>
        <p>{row.phrase.text}</p>
        <Life end={theirs.expires_at} tone="theirs" />
      </section>
      <MatchBody row={row} keys={keys} logic={logic} onBack={onBack} onWaiting={onWaiting} />
    </main>
  );
}
