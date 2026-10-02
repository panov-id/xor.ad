// Screen 03 (panel/design/sheets/screen-03.svg): the cards of the circle the
// viewer names, thirty at a time and more by cursor (protocol §6); "Здесь пока
// тихо" when nobody is speaking, with the radius as the only way to widen.
// Since W2 a card opens full-screen (Card.tsx), "написать" leads to the
// composer and "лайкнутое" to the likes; one's own phrase just sent is named
// over the list with the node's verdict — out, or read by a person first.
// The filters are not here yet.

import { Fragment, type ReactNode } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { nearby } from "../a11y/nearby.ts";
import { modes, type Sent } from "../api/actions.ts";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { HeaderFeed } from "../ui/Header.tsx";
import { useFeed } from "./logic/useFeed.ts";
import { say } from "../locales/say.ts";

export interface FeedCard {
  id: string;
  text: string;
  mode: string;
  lang: string;
  like_count: number;
  // A neighbour's offer: the node nests the discount (routes/feed.ts deliver).
  // A venue's offer comes as kind "offer" with the venue's name (O2).
  // A venue's offer also carries its exit link, `<domain>/o/<code>`, and
  // whether the node switched it off — the card reports a bad link (WS3).
  offer?: { discount_value: string; conditions?: string | null; venue_name?: string; redirect?: string; redirect_disabled?: boolean };
  kind?: string;
  // A table (G1h, W10): kind "table", between the phrases; never full, never
  // one's own or one liked. `game` is the class, as FeedItem names it.
  game?: string;
  set?: string;
  seats?: number;
  free_seats?: number;
  playing?: number;
  watching?: number;
  name?: string | null;
  soon?: boolean;
}

export const RADII: Radius[] = [100, 300, 1000, 3000, 10000];
const label = (r: Radius) => (r >= 1000 ? say("web.feed.km", { n: r / 1000 }) : say("web.feed.m", { n: r }));

export function Feed(
  { client, sealed, at, radius, onRadius, onOpen, onWrite, onLikes, sent, onTakenDown, gone, onTable, onNewTable, notice, renderPhrase, listClass, brandClass }: {
    client: Client;
    // A brand's FeedView draws the phrase cards its own way (web/src/brands):
    // the element must keep data-testid="card", data-id and open on a press.
    renderPhrase?: (card: FeedCard, index: number, open: () => void) => ReactNode;
    listClass?: string;
    brandClass?: string;
    // A table card sits down at the table; "new table" makes one (W10).
    onTable?: (id: string) => void;
    onNewTable?: () => void;
    // A refusal to seat, said on the feed.
    notice?: string | null;
    sealed: "ok" | "failed" | "unlocked" | "unlocked-new-wrap";
    at: { lat: number; lon: number };
    radius: Radius;
    onRadius: (r: Radius) => void;
    onOpen: (card: FeedCard) => void;
    onWrite: () => void;
    onLikes: () => void;
    // One's own phrase just sent, with the node's verdict (Composer.tsx).
    // `id` is what POST /feed answered; without it the phrase cannot be taken
    // down from here (W11-C, as the terminal's W11-B).
    sent?: { state: Exclude<Sent, { state: "refused" }>["state"]; text: string; id?: string } | null;
    // My own phrase came down: the holder of `sent` forgets it.
    onTakenDown?: () => void;
    // A card that left this feed on the card screen: hidden, or its author blocked.
    gone?: { why: "hidden" | "blocked"; id: string } | null;
  },
) {
  const { phase, items, next, state, error, takingDown, takedownRefused, takeDown, load, refused, said } =
    useFeed({ client, at, radius, sent, onTakenDown });
  return (
    <main className={["screen feed", brandClass].filter(Boolean).join(" ")} data-screen="feed" data-sealed={sealed}>
      {/* What the reader hears: the announced step, not every flicker of it. */}
      <HeaderFeed
        place={say("web.feed.title")}
        phase={brandClass ? undefined : phase}
        step={said ? nearby(said) : ""}
        stepProps={{ role: "status", "data-testid": "nearby", "data-step": said ?? undefined }}
        action={
          <label className="radius">
            <span className="visually-hidden">{say("web.feed.radius")}</span>
            <select value={radius} onChange={(e) => onRadius(Number(e.target.value) as Radius)} data-testid="radius">
              {RADII.map((r) => <option key={r} value={r}>{label(r)}</option>)}
            </select>
          </label>
        }
      />
      <nav className="actions ui-icon-row">
        <Button type="button" kind="primary" icon="write" aria-label={say("feed.write")} onClick={onWrite} data-testid="write" />
        <Button type="button" icon="likes" aria-label={say("liked.title")} onClick={onLikes} data-testid="likes" />
        {onNewTable && <Button type="button" icon="table" aria-label={say("web.feed.newTable")} onClick={onNewTable} data-testid="new-table" />}
      </nav>
      {refused > 0 && !sent && (
        <p className="error" data-testid="refused" data-count={refused}>{say("web.feed.refused")}</p>
      )}
      {sent && (
        <p className="warn" data-testid="sent" data-state={sent.state}>
          {sent.state === "published" ? say("web.feed.sent_out") : say("web.feed.sent_held")}
          «{sent.text}»
          {/* In view only while the id is known — not greyed, absent (W11-C). */}
          {sent.id && (
            <Button type="button" icon="close" aria-label={say("feed.takedown")} disabled={takingDown} onClick={() => void takeDown()} data-testid="takedown" />
          )}
        </p>
      )}
      {sent && takedownRefused !== null && (
        <p className="error" data-testid="takedown-refused">{say("feed.takedownRefused", { status: takedownRefused })}</p>
      )}
      {gone && (
        <p className="muted" data-testid="gone" data-why={gone.why}>
          {gone.why === "hidden" ? say("web.feed.hidden") : say("web.feed.blocked")}
        </p>
      )}
      {state === "failed" && <p className="error" data-testid="error">{error}</p>}
      {notice && <p className="error" data-testid="table-refused">{notice}</p>}
      {state === "ready" && items.length === 0 && (
        <section className="empty" data-testid="quiet">
          <h2>{say("web.feed.empty")}</h2>
          <p className="muted">{say("web.feed.empty_hint")}</p>
          {radius < 10000 && (
            <Button type="button" icon="pin" aria-label={say("web.feed.wider", { radius: label(RADII[RADII.indexOf(radius) + 1]) })} onClick={() => onRadius(RADII[RADII.indexOf(radius) + 1])} />
          )}
        </section>
      )}
      <ul className={listClass ?? "cards"} data-testid="cards">
        {items.filter((card) => card.id !== gone?.id).map((card, index) => card.kind === "table"
          ? (
            <Card as="li" key={card.id} kind="nested" className="table-card" data-testid="table-card" data-id={card.id} onClick={() => onTable?.(card.id)} role="button" tabIndex={0}
              onKeyDown={(k) => (k.key === "Enter" || k.key === " ") && onTable?.(card.id)}>
              <p>{say("table.title")}{card.name ? ` · «${card.name}»` : ""} · {card.game} {card.set}</p>
              <span className="muted">{say("table.playing")} {card.playing ?? 0} · {say("table.watching")} {card.watching ?? 0} · {say("web.feed.tableFree", { n: card.free_seats ?? 0 })} · ♥ {card.like_count ?? 0}</span>
            </Card>
          )
          : renderPhrase
          ? <Fragment key={card.id}>{renderPhrase(card, index, () => onOpen(card))}</Fragment>
          : (
          <Card as="li" key={card.id} data-testid="card" data-id={card.id} onClick={() => onOpen(card)} role="button" tabIndex={0}>
            {card.offer && <span className="offer" data-testid="offer">−{card.offer.discount_value}</span>}
            {/* The node files every phrase as "und" (relay routes/feed.ts): an
                undetermined language is no word for a person and no lang for a
                reader; a known one is both. */}
            <p lang={card.lang && card.lang !== "und" ? card.lang : undefined}>{card.text}</p>
            <span className="muted">{modes().find((m) => m.value === card.mode)?.label ?? card.mode}{card.lang && card.lang !== "und" ? ` · ${card.lang}` : ""} · ♥ {card.like_count}{card.soon ? say("web.feed.soon") : ""}</span>
          </Card>
          ))}
      </ul>
      {state === "loading" && <p className="muted skeleton" data-testid="loading">…</p>}
      {next && state === "ready" && (
        <Button type="button" icon="new" className="ui-wide" aria-label={say("liked.more")} onClick={() => load(next)} data-testid="more" />
      )}
      <footer className="muted">
        {say("web.feed.keys", { state: sealed === "unlocked" ? say("web.feed.keys_unlocked") : sealed === "unlocked-new-wrap" ? say("web.feed.keys_new_wrap") : sealed === "ok" ? say("web.feed.keys_ok") : say("web.feed.keys_bad") })}
      </footer>
    </main>
  );
}
