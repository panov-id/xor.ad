// Screen 03 (panel/design/sheets/screen-03.svg): the cards of the circle the
// viewer names, thirty at a time and more by cursor (protocol §6); "Здесь пока
// тихо" when nobody is speaking, with the radius as the only way to widen.
// Since W2 a card opens full-screen (Card.tsx), "написать" leads to the
// composer and "лайкнутое" to the likes; one's own phrase just sent is named
// over the list with the node's verdict — out, or read by a person first.
// The filters are not here yet. Kit elements only (K6a): the keys line that
// used to stand at the foot is gone (owner 10.10.2026) — the seal's state stays
// in data-sealed, and a seal that does not match is an ErrorLine in words.

import { Fragment, type ReactNode } from "react";
import type { Client, Radius } from "../../../depth/core/client.ts";
import { nearby } from "../a11y/nearby.ts";
import { languageIn, modes, type Sent } from "../api/actions.ts";
import { classWord, setWord } from "../api/tables.ts";
import { Button } from "../ui/Button.tsx";
import { Card, CardOpen, LikeCount, openerIds } from "../ui/Card.tsx";
import { ErrorLine } from "../ui/ErrorLine.tsx";
import { HeaderFeed } from "../ui/Header.tsx";
import { Actions } from "../ui/Links.tsx";
import { EmptyState } from "../ui/Notices.tsx";
import { Screen } from "../ui/Screen.tsx";
import { Select } from "../ui/Select.tsx";
import { StatusInline } from "../ui/Status.tsx";
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
  { client, sealed, at, radius, onRadius, onOpen, onWrite, onLikes, onPlace, sent, onTakenDown, gone, onTable, onNewTable, notice, renderPhrase, listClass, brandClass }: {
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
    at: { lat: number; lon: number; name?: string };
    // The place's name opens the picker (screens/Place.tsx).
    onPlace?: () => void;
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
  const { items, next, state, error, takingDown, takedownRefused, takeDown, load, refused, said } =
    useFeed({ client, at, radius, sent, onTakenDown });
  const widerTo = radius < 10000 ? RADII[RADII.indexOf(radius) + 1] : null;
  return (
    <Screen name="feed" title={say("web.feed.title")} className={brandClass} data-sealed={sealed} header={
      /* What the reader hears: the announced step, not every flicker of it. */
      <HeaderFeed
        place={at.name ?? say("web.feed.title")}
        step={said ? nearby(said) : ""}
        stepProps={{ role: "status", "data-testid": "nearby", "data-step": said ?? undefined }}
        action={
          <span className="ui-icon-row" data-testid="radius">
            {onPlace && <Button type="button" icon="pin" aria-label={say("web.place.open", { name: at.name ?? "" })} onClick={onPlace} data-testid="place" />}
            <Select
              label={say("web.feed.radius")}
              options={RADII.map((r) => ({ value: String(r), label: label(r) }))}
              value={String(radius)}
              onChange={(value) => onRadius(Number(value) as Radius)}
            />
          </span>
        }
      />
    }>
      <Actions>
        <Button type="button" icon="likes" aria-label={say("liked.title")} onClick={onLikes} data-testid="likes" />
        {onNewTable && <Button type="button" icon="table" aria-label={say("web.feed.newTable")} onClick={onNewTable} data-testid="new-table" />}
        <Button type="button" kind="primary" icon="write" aria-label={say("feed.write")} onClick={onWrite} data-testid="write" />
      </Actions>
      {sealed === "failed" && <ErrorLine data-testid="sealed-failed">{say("web.feed.seal_bad")}</ErrorLine>}
      {refused > 0 && !sent && (
        <ErrorLine data-testid="refused" data-count={String(refused)}>{say("web.feed.refused")}</ErrorLine>
      )}
      {sent && (
        <StatusInline data-testid="sent" data-state={sent.state}>
          {sent.state === "published" ? say("web.feed.sent_out") : say("web.feed.sent_held")}
          «{sent.text}»
          {/* In view only while the id is known — not greyed, absent (W11-C). */}
          {sent.id && (
            <Button type="button" icon="close" aria-label={say("feed.takedown")} disabled={takingDown} onClick={() => void takeDown()} data-testid="takedown" />
          )}
        </StatusInline>
      )}
      {sent && takedownRefused !== null && (
        <ErrorLine data-testid="takedown-refused">{say("feed.takedownRefused", { status: takedownRefused })}</ErrorLine>
      )}
      {gone && (
        <p className="ui-hint" data-testid="gone" data-why={gone.why}>
          {gone.why === "hidden" ? say("web.feed.hidden") : say("web.feed.blocked")}
        </p>
      )}
      {state === "failed" && <ErrorLine data-testid="error">{error}</ErrorLine>}
      {notice && <ErrorLine data-testid="table-refused">{notice}</ErrorLine>}
      {state === "ready" && items.length === 0 && (
        <EmptyState
          title={say("web.feed.empty")}
          line={say("web.feed.empty_hint")}
          action={widerTo ? { label: say("web.feed.wider", { radius: label(widerTo) }), onSelect: () => onRadius(widerTo) } : undefined}
          data-testid="quiet"
        />
      )}
      <ul className={listClass ?? "ui-cards"} data-testid="cards">
        {items.filter((card) => card.id !== gone?.id).map((card, index) => card.kind === "table"
          ? (
            <Card as="li" key={card.id} kind="nested" of="table" data-testid="table-card" data-id={card.id}>
              <CardOpen id={card.id} onOpen={() => onTable?.(card.id)} />
              <p id={openerIds(card.id).text}>{say("table.title")}{card.name ? ` · «${card.name}»` : ""} · {classWord(card.game ?? "")} · {setWord(card.set ?? "")}</p>
              <span className="ui-hint" id={openerIds(card.id).foot}>{say("table.playing")} {card.playing ?? 0} · {say("table.watching")} {card.watching ?? 0} · {say("web.feed.tableFree", { n: card.free_seats ?? 0 })} · <LikeCount n={card.like_count ?? 0} /></span>
            </Card>
          )
          : renderPhrase
          ? <Fragment key={card.id}>{renderPhrase(card, index, () => onOpen(card))}</Fragment>
          : (
          <Card as="li" key={card.id} of="phrase" data-testid="card" data-id={card.id}>
            <CardOpen id={card.id} onOpen={() => onOpen(card)} />
            {card.offer && <span className="ui-offer" data-testid="offer">−{card.offer.discount_value}</span>}
            {/* The node files every phrase as "und" (relay routes/feed.ts): an
                undetermined language is no word for a person and no lang for a
                reader; a known one is both. */}
            <p id={openerIds(card.id).text} lang={card.lang && card.lang !== "und" ? card.lang : undefined}>{card.text}</p>
            <span className="ui-hint" id={openerIds(card.id).foot}>{modes().find((m) => m.value === card.mode)?.label ?? card.mode}{languageIn(card.lang) ? ` · ${languageIn(card.lang)}` : ""} · <LikeCount n={card.like_count} />{card.soon ? say("web.feed.soon") : ""}</span>
          </Card>
          ))}
      </ul>
      {state === "loading" && <p className="ui-hint" data-testid="loading">…</p>}
      {next && state === "ready" && (
        <Button type="button" icon="new" className="ui-wide" aria-label={say("liked.more")} onClick={() => load(next)} data-testid="more" />
      )}
    </Screen>
  );
}
