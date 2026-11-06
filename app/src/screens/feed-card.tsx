// The phrase card and what hangs on it (sosed Dusk sheets): the tile in the list (w1_feed, w1_feed-hidden-return,
// w1_feed-blocked), the card full-screen (w1_card, w1_card-liked, w1_card-matched), its «…» as a bottom sheet
// (w1_card-more: hide, notice, block the author). The calls are the SDK's: client.like / hide / blockByPhrase /
// request("POST", "/report"), as the web's useCard makes them. The same testids as the web's where it has them:
// card, offer, text, mode, like, more, hide, notice, block.
import { type CSSProperties, type FormEvent, useEffect, useLayoutEffect, useState } from "react";
import { Said } from "../shell/failed";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, LANG, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { blockMark, chat, chevronLeft, chevronRight, ellipsis, eyeOff, flag, hand } from "../shell/icons";
import { useLayers } from "../shell/layers";
import { RailTablet, type Tab, TabBar } from "../shell/TabBar";
import { NdIcon } from "../shell/NdIcon";
import { useMinWidth } from "../shell/useMinWidth";
import { Offer } from "./Offer";
import { InPane } from "./me/parts";
import { lineOf } from "./tables/table-row";
import { gameOfTable } from "@sdk/new_table.ts";
import { type FeedCard, langOf, type LikeOutcome, matchOf, offerLabel, offerReportUrl, peerName, textSize, tileFade, tileMetres, type Tone, UNDO_HIDE_MS } from "./feed-logic";
import { storedPlace } from "../place";
import { distanceWord } from "./talks/talks-logic";
import { useDrawing } from "../nd4/drawing";
import { CardBothLine, CardBothTalk } from "../nd4/screens/card-both.gen";
import { CardChips, CardFrame, CardFrameLaptop, CardFrameTablet, CardHand, CardHandLit, CardHead, CardNote, CardPhrase } from "../nd4/screens/card-in.gen";
import { CardMoreSheet, CardMoreSheetWide } from "../nd4/screens/card-more.gen";
import { OfferChips, OfferFoot, OfferHand, OfferPanel } from "../nd4/screens/offer-card.gen";
import { CardNeedSheet, CardNeedSheetWide } from "../nd4/screens/card-need.gen";
import { FEED_TILE_FS, FeedTile } from "../nd4/screens/feed-tile.gen";
import { FeedTileLaptop } from "../nd4/screens/feed-tile-laptop.gen";
import { FeedTileTablet } from "../nd4/screens/feed-tile-tablet.gen";
import { FeedOwn } from "../nd4/screens/feed-own.gen";
import { FeedOwnLaptop } from "../nd4/screens/feed-own-laptop.gen";
import { FeedOwnTablet } from "../nd4/screens/feed-own-tablet.gen";

const modeWord = (mode: string): string => {
  const key = `web.mode.${mode}`;
  const word = say(key);
  return word === key ? mode : word;
};

function languageIn(lang: string | undefined): string | undefined {
  const l = langOf(lang);
  if (!l) return undefined;
  try {
    const name = new Intl.DisplayNames([LANG], { type: "language" }).of(l);
    return name && name.toLowerCase() !== l.toLowerCase() ? name : undefined;
  } catch { return undefined; }
}

/** The like's outcome in words; null while there is none. */
export function likeLine(o: LikeOutcome | null): string | null {
  if (!o) return null;
  if (o.state === "matched") return say("web.card.matched");
  if (o.state === "liked") return say("web.card.liked");
  if (o.cause === "stepped_away") return say("away.line");
  if (o.cause === "rapid") return say("write.rapid");
  return say("app.feed.like_other", { status: o.status });
}


/** The mode's mark in the tile's corner (feed.html: the badge, the colour by the tile's tone). */
const MODE_ICON: Record<string, string> = { alone: "alone", company: "friends", friends: "friends", party: "party" };
const TONE_COLOUR: Record<Tone, string> = { lime: "3", yellow: "6", peach: "2", coral: "1" };

/** How many columns the list has: the CSS says (--fd-cols in tokens/wide.css), the page follows it as the window changes. */
export function useColumns(ref: { current: HTMLElement | null }): number {
  const [n, setN] = useState(2);
  useLayoutEffect(() => {
    const read = () => {
      if (!ref.current) return;
      const v = parseInt(getComputedStyle(ref.current).getPropertyValue("--fd-cols"), 10);
      setN(v >= 1 ? v : 2);   // the prototype's two columns unless the wide layout says more
    };
    read();
    addEventListener("resize", read);
    return () => removeEventListener("resize", read);
  }, [ref]);
  return n;
}

/** A phrase tile of the prototype (feed.html article): the author's circle and the in-count, the mode's badge, the words,
 * and at the foot the mode word and «I'm in». The whole tile opens the card; the round button likes at once. */
export function Tile({ card, tone, busy, onOpen, onLike, testid = "card", d = 0, dist }: { card: FeedCard; tone: Tone; busy: boolean; onOpen: () => void; onLike: () => void; testid?: string; d?: number; dist?: string }) {
  const wide = useDrawing();
  // an offer keeps the kit's tile: the archive's tile of an offer is not taken yet (docs/newdesign4/MAP_EN.md)
  if (card.offer) return <KitTile card={card} tone={tone} busy={busy} onOpen={onOpen} onLike={onLike} testid={testid} />;
  // docs/newdesign4 screen 283: the archive's phrase tile (nd4/screens/feed-tile*.gen.tsx); liking is on the open card
  const Gen = wide === "laptop" ? FeedTileLaptop : wide === "tablet" ? FeedTileTablet : FeedTile;
  const m = tileMetres(card, storedPlace());
  const w = m === null ? null : distanceWord(m);
  return (
    <li style={{ display: "contents" }}>
      <Gen id={card.id} testid={testid} d={d} lang={langOf(card.lang)} dist={dist ?? (w ? say(w.key, { n: w.n }) : "")} text={card.text}
        fs={FEED_TILE_FS[textSize(card.text)]} fade={tileFade(card)} fadeLabel={say(card.soon ? "app.feed.fades_soon" : "app.feed.fades")}
        likes={card.like_count} likesLabel={say("app.feed.likes_n", { n: card.like_count })} counted={!card.liked && card.like_count > 0}
        mine={card.liked === true} mineLabel={say("app.feed.you_liked")} onOpen={onOpen} />
    </li>
  );
}

/** docs/newdesign4 screen 36 `feed-own`: one's own phrase while it is checked, first in the feed (nd4/screens/feed-own*.gen.tsx). */
export function OwnTile({ id, text, onOpen }: { id?: string; text: string; onOpen: () => void }) {
  const wide = useDrawing();
  const Gen = wide === "laptop" ? FeedOwnLaptop : wide === "tablet" ? FeedOwnTablet : FeedOwn;
  return <li style={{ display: "contents" }}><Gen id={id} status={say("app.my.checking")} text={text} fs={FEED_TILE_FS[textSize(text)]} onOpen={onOpen} /></li>;
}

function KitTile({ card, tone, busy, onOpen, onLike, testid }: { card: FeedCard; tone: Tone; busy: boolean; onOpen: () => void; onLike: () => void; testid: string }) {
  const offer = card.offer;
  // A venue's offer is no feed message: no count, no mode, and nothing to like (relay/node/src/routes/feed.ts venueOffers); its round button opens the card.
  const isVenue = card.kind === "offer";
  return (
    <li className="k-tile" data-testid={testid} data-id={card.id} data-accent={offer ? "" : undefined}>
      <div className="k-row k-tile-head">
        <span className="k-ava" aria-hidden="true"><NdIcon name="me" /></span>
        <span className="k-meta">{isVenue ? offer?.venue_name ?? "" : say("app.feed.in_n", { n: card.like_count })}</span>
      </div>
      {offer
        ? <span className="k-badge-white k-corner" data-testid="offer"><NdIcon name="offer" /><span className="k-offer">{offerLabel(offer.discount_value)}</span></span>
        : <span className="k-badge" data-c={TONE_COLOUR[tone]} aria-hidden="true"><NdIcon name={MODE_ICON[card.mode] ?? "phrase"} /></span>}
      <button type="button" className="k-words" data-testid="card-open" onClick={onOpen} lang={langOf(card.lang)} data-size={textSize(card.text)}>{card.text}</button>
      <div className="k-foot">
        <span className="k-meta" data-testid="mode">{isVenue ? "" : modeWord(card.mode)}{card.liked ? ` · ${say("app.feed.you_too")}` : ""}{card.farther_than_asked ? ` · ${say("app.feed.farther")}` : ""}</span>
        <button type="button" className="k-round" aria-label={say("web.card.like")} aria-pressed={card.liked === true} disabled={busy || card.liked === true}
          onClick={isVenue ? onOpen : onLike} data-testid="tile-like" data-lit={card.liked ? "" : undefined}><NdIcon name={card.liked ? "imin" : "imin-off"} /></button>
      </div>
    </li>
  );
}

/** A table between the phrases (feed.html: the short tile with the game's badge and the free seats' count). */
export function TableTile({ card, onOpen }: { card: FeedCard; onOpen?: () => void }) {
  const line = lineOf(card as never);
  const game = gameOfTable(card.game ?? "", card.set);
  return (
    <li className="k-tile k-tile-short" data-testid="table-card" data-id={card.id}>
      <span className="k-badge" data-c="2" aria-hidden="true"><NdIcon name={game ? `g-${game.id}` : "tables"} /></span>
      {typeof card.free_seats === "number" && card.free_seats > 0 && <span className="k-count">{card.free_seats}</span>}
      <button type="button" className="k-words" onClick={onOpen} disabled={!onOpen}>{line.title}</button>
      <span className="k-meta">{line.meta}</span>
    </li>
  );
}

/** The card full-screen over the feed: back, the phrase large, three rows, «I'm in». */
export function CardScreen({ client, card, onTab, onTalk, onBack, onGone, onLike, onUnlike, needPhrase = false, onSay }: {
  client: Client;
  card: FeedCard;
  onTab?: (tab: Tab) => void;
  /** «Talk» of the matched card (w1_card-matched): the offer to talk waits in Talks. */
  onTalk?: () => void;
  onBack: () => void;
  onGone: (why: "hidden" | "blocked", id: string, handle?: string) => void;
  onLike: (card: FeedCard) => Promise<LikeOutcome>;
  /** card-in «Take back»: true once the node took the like back. */
  onUnlike?: (card: FeedCard) => Promise<boolean>;
  /** card-need: no live phrase of one's own, so «I'm in» would be refused; the card offers to say one first. */
  needPhrase?: boolean;
  onSay?: () => void;
}) {
  // desktop 3-nearby card.svg: in the feed's right pane, the feed stays
  const desk = useMinWidth("--bp-desktop");
  // offer-exit.svg: the offer's own link opens its exit (Offer.tsx) in place of the card; the code as the web reads it (web useCard.ts)
  const [exit, setExit] = useState<string | null>(null);
  const link = card.offer?.redirect && !card.offer.redirect_disabled ? card.offer.redirect.split("/o/").pop()?.split("/")[0] ?? null : null;
  const { open } = useLayers();
  // Opened on a card the node already marks matched (feed row match_id): the same state a like's answer leaves, so card-both stands after a reload (screen 52, owner 02.11.2026).
  const [outcome, setOutcome] = useState<LikeOutcome | null>(() => matchOf(card));
  const [busy, setBusy] = useState(false);
  const lit = card.liked === true || (outcome !== null && outcome.state !== "refused");
  const language = languageIn(card.lang);
  const line = likeLine(outcome);
  // Both in (w1_card-matched): the note names the one who is in too; the like's answer holds the match's id, the inbox holds its name.
  const matched = outcome?.state === "matched";
  const [peer, setPeer] = useState<string | null>(null);
  useEffect(() => {
    if (outcome?.state !== "matched") return;
    let live = true;
    client.inbox().then((rows) => { if (live) setPeer(peerName(rows, outcome.matchId)); }).catch(() => {});
    return () => { live = false; };
  }, [outcome, client]);
  async function like() {
    setBusy(true);
    try { setOutcome(await onLike(card)); } finally { setBusy(false); }
  }
  async function unlike() {
    if (!onUnlike) return;
    setBusy(true);
    try { if (await onUnlike(card)) setOutcome(null); } finally { setBusy(false); }
  }
  // card-need: not liked, not matched, and no phrase of one's own alive
  const need = needPhrase && !lit && !matched && card.kind !== "offer";
  const count = card.like_count + (lit && !card.liked ? 1 : 0);
  // a hook: above the early return, or pressing an offer's link changes the hook order
  const drawing = useDrawing();
  // the prototype's card (docs/newdesign/proto/card.html, card-in): the bar with back and «…», the phrase's panel, three
  // facts as tiles, and the action panel at the foot
  if (exit) {
    const page = <Offer code={exit} client={client} onBack={() => setExit(null)} />;
    // at the desktop the exit stands in the card's pane, as Me's sub-pages do (offer-exit.svg)
    return desk ? <div className="k-me-pane" data-testid="offer-pane"><InPane.Provider value={true}>{page}</InPane.Provider></div> : page;
  }
  const Frame = drawing === "laptop" ? CardFrameLaptop : drawing === "tablet" ? CardFrameTablet : CardFrame;
  const metres = tileMetres(card, storedPlace());
  const far = metres === null ? null : distanceWord(metres);
  const size = textSize(card.text);
  const openMore = () => open("card-more", <MoreSheet client={client} card={card} onGone={onGone} />);
  // docs/newdesign4 screens 51 card-in, 52 card-both (nd4/screens/card-in.gen.tsx, card-both.gen.tsx), 62 offer-card (nd4/screens/offer-card.gen.tsx)
  // Screen 62: the archive's hand is «Say it with this offer», it opens composing (docs/newdesign4/BRIEF_REWORK); liked and both-in stay the phrase card's.
  // A neighbour's phrase with a discount also has card.offer (relay/node/src/routes/feed.ts): the panel and the chips show the discount, but no venue, and its hand stays «I'm in», or the match is lost.
  const offer = card.offer;
  const venueOffer = card.kind === "offer" && !!offer;
  const hand = matched
          ? <><CardBothLine line={peer ? `${say("app.card.both")} · ` : say("app.card.both")} name={peer ?? ""} /><CardBothTalk talkText={label("web.match.talk")} onTalk={onTalk} /></>
          : lit
            ? <><CardNote testid="like-line" state={outcome?.state} text={line ?? say("web.card.liked")} /><CardHandLit label={say("app.card.take_back")} off={busy || !onUnlike} onUnlike={() => void unlike()} /></>
            : <>{line && <CardNote testid="like-line" state={outcome?.state} text={line} />}{venueOffer ? onSay && <OfferHand label={say("app.card.offer_say")} off={busy} onLike={onSay} /> : <CardHand label={say("app.feed.im_in")} off={busy} top={line ? "0" : "auto"} onLike={need && onSay ? () => open("card-need", <NeedSheet onSay={onSay} />) : () => void like()} />}</>;
  const body = (
      <Frame>
        <CardHead backLabel={say("common.back")} onBack={onBack} moreLabel={say("web.card.more")} onMore={openMore} />
        {offer ? <OfferPanel venue={venueOffer ? offer.venue_name ?? "" : far ? say(far.key, { n: far.n }) : ""} dist={venueOffer && far ? say(far.key, { n: far.n }) : ""} text={card.text} lang={langOf(card.lang)} conditions={[offer.conditions ? say("web.card.conditions", { conditions: offer.conditions }) : "", venueOffer && offer.promo_code ? say("app.card.promo", { code: offer.promo_code }) : ""].filter(Boolean).join(" · ")}
          fade={tileFade(card)} fadeText={say(card.soon ? "app.feed.fades_soon" : "app.feed.fades")} /> : <CardPhrase dist={far ? say(far.key, { n: far.n }) : ""} text={card.text} fs={size === "l" ? undefined : FEED_TILE_FS[size]} lang={langOf(card.lang)}
          fade={tileFade(card)} fadeText={say(card.soon ? "app.feed.fades_soon" : "app.feed.fades")} />}
        {offer ? <OfferChips fromVenue={venueOffer ? say("app.card.from_venue") : modeWord(card.mode)} discount={offerLabel(offer.discount_value)} /> : <CardChips likesLabel={say("app.feed.likes_n", { n: count })} likes={count} alone={card.mode === "alone"} friend={card.mode === "company" || card.mode === "friends"} group={card.mode === "party"}
          mode={modeWord(card.mode)} language={language} />}
        {offer ? <OfferFoot linkLabel={say("app.offer.leaving")} onLink={link ? () => setExit(link) : undefined}>{hand}</OfferFoot> : hand}
      </Frame>
  );
  const onTablet = drawing === "tablet";
  const phrase = onTablet ? <><RailTablet active="feed" />{body}</> : <div className="k-col">{body}</div>;
  return (
    <main className={desk ? "k-screen k-card-pane" : "k-screen k-over"} data-screen="card" data-width={onTablet ? "tablet" : undefined} data-id={card.id}>
      {phrase}
      {!onTablet && <TabBar active="feed" onSelect={onTab} railOnly />}
    </main>
  );
}

/** docs/newdesign4 screen 53 `card-need`: the hand pressed with no phrase of one's own alive (nd4/screens/card-need.gen.tsx). */
function NeedSheet({ onSay }: { onSay: () => void }) {
  const { close } = useLayers();
  const Gen = useDrawing() === "phone" ? CardNeedSheet : CardNeedSheetWide;
  return <Gen onClose={close} title={say("app.card.need_title")} text={say("app.card.need")} laterText={say("app.card.need_later")} sayText={say("app.card.need_say")}
    onSay={() => { close(); onSay(); }} />;
}

type Panel = "menu" | "block" | "notice" | "noticed";

/** Also screen 111's «…» over their phrase (MatchWaiting.tsx). «…» of the card in a bottom sheet: Hide, Notice (Art. 16 DSA, as the web sends it), Block the author (asked twice). */
export function MoreSheet({ client, card, onGone }: { client: Client; card: FeedCard; onGone: (why: "hidden" | "blocked", id: string, handle?: string) => void }) {
  const { close } = useLayers();
  const Menu = useDrawing() === "phone" ? CardMoreSheet : CardMoreSheetWide;
  const [panel, setPanel] = useState<Panel>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [bona, setBona] = useState(false);
  const [ref, setRef] = useState("");
  // A venue has no author to block: its third row is «no discount given», on the landing's report page (owner 02.11).
  const reportUrl = card.kind === "offer" ? offerReportUrl(card.id, card.offer?.redirect) : null;

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await run(); } catch (e) { setError(failedLine(e)); } finally { setBusy(false); }
  }
  const hide = () => act(async () => { const handle = await client.hide(card.id); close(); onGone("hidden", card.id, handle); });
  const block = () => act(async () => { await client.blockByPhrase(card.id); close(); onGone("blocked", card.id); });
  const notice = (e: FormEvent) => {
    e.preventDefault();
    return act(async () => {
      // Sent unsigned: the notifier's identity is not attached to a notice (docs/dsa/SPEC_RU.md §6; web useCard sendNotice).
      const answer = await client.request<{ id?: string }>("POST", "/report", {
        target_kind: card.kind === "offer" ? "offer" : "feed_message", target_id: card.id, reason_text: reason.trim(),
        notifier_name: null, notifier_email: null, bona_fide: true, lang: LANG, source: "app-card",
      }, false);
      if (answer.status !== 202 || !answer.body?.id) throw new Said(say("web.card.notice_refused", { status: answer.status }));
      setRef(answer.body.id);
      setPanel("noticed");
    });
  }

  const failed = error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>;
  // docs/newdesign4 screen 54 (nd4/screens/card-more.gen.tsx); «Report» and «Block» keep the kit's panels until rows 57 and 56
  if (panel === "menu") {
    return <Menu onClose={close} busy={busy} hideText={say("app.card.more_hide")} hideSub={say("app.card.more_hide_sub", { n: UNDO_HIDE_MS / 1000 })} onHide={() => void hide()}
      noticeText={label("web.card.notice")} noticeSub={say("app.card.more_notice_sub")} onNotice={() => setPanel("notice")}
      blockText={say(reportUrl ? "app.card.complain" : "app.feed.block_author")} blockSub={say(reportUrl ? "app.card.complain_sub" : "app.card.more_block_sub")} onBlock={() => { if (!reportUrl) return setPanel("block"); window.open(reportUrl, "_blank", "noopener"); close(); }} cancelText={label("web.card.cancel")} error={failed} />;
  }
  return (
    <div className="k-stack" data-testid="card-more" data-panel={panel}>
      <h2 className="k-sheet-title">{label("web.card.phrase")}</h2>
      {panel === "block" && (
        <div className="k-stack">
          <p>{say("web.card.block_warning")}</p>
          <div className="k-two">
            <button type="button" className="k-btn" disabled={busy} onClick={() => setPanel("menu")} data-testid="block-no">{say("web.card.block_no")}</button>
            <button type="button" className="k-btn" data-danger="" disabled={busy} onClick={() => void block()} data-testid="block-yes">{say("web.card.block_yes")}</button>
          </div>
        </div>
      )}
      {panel === "notice" && (
        <form className="k-stack" onSubmit={(e) => void notice(e)}>
          <textarea className="k-field" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={say("web.card.notice_reason")} aria-label={say("web.card.notice_reason")} rows={3} data-testid="notice-reason" />
          <label className="k-check"><input type="checkbox" checked={bona} onChange={(e) => setBona(e.target.checked)} data-testid="notice-bona" /><span>{say("web.card.notice_bona")}</span></label>
          <div className="k-two">
            <button type="button" className="k-btn" disabled={busy} onClick={() => setPanel("menu")}>{say("web.card.cancel")}</button>
            <button type="submit" className="k-btn" data-primary="" disabled={busy || !bona || reason.trim() === ""} data-testid="notice-send">{say("web.card.notice_send")}</button>
          </div>
        </form>
      )}
      {panel === "noticed" && (
        <div className="k-stack">
          <p data-testid="noticed">{say("web.card.notice_sent", { ref })}</p>
          <button type="button" className="k-btn" onClick={close}>{say("common.back")}</button>
        </div>
      )}
      {failed}
    </div>
  );
}
