// The phrase card and what hangs on it (sosed Dusk sheets): the tile in the list (w1_feed, w1_feed-hidden-return,
// w1_feed-blocked), the card full-screen (w1_card, w1_card-liked, w1_card-matched), its «…» as a bottom sheet
// (w1_card-more: hide, notice, block the author). The calls are the SDK's: client.like / hide / blockByPhrase /
// request("POST", "/report"), as the web's useCard makes them. The same testids as the web's where it has them:
// card, offer, text, mode, like, more, hide, notice, block.
import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import { Said } from "../shell/failed";
import type { Client } from "@sdk/client.ts";
import { failedLine, label, LANG, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { blockMark, chat, chevronLeft, chevronRight, ellipsis, eyeOff, flag, hand } from "../shell/icons";
import { useLayers } from "../shell/layers";
import { type Tab, TabBar } from "../shell/TabBar";
import { NdIcon } from "../shell/NdIcon";
import { useMinWidth } from "../shell/useMinWidth";
import { Offer } from "./Offer";
import { InPane } from "./me/parts";
import { lineOf } from "./tables/table-row";
import { gameOfTable } from "@sdk/new_table.ts";
import { type FeedCard, langOf, type LikeOutcome, offerLabel, peerName, textSize, type Tone } from "./feed-logic";

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

/** A phrase tile of the prototype (feed.html article): the author's circle and the in-count, the mode's badge, the words,
 * and at the foot the mode word and «I'm in». The whole tile opens the card; the round button likes at once. */
export function Tile({ card, tone, busy, onOpen, onLike, testid = "card" }: { card: FeedCard; tone: Tone; busy: boolean; onOpen: () => void; onLike: () => void; testid?: string }) {
  const offer = card.offer;
  return (
    <li className="k-tile" data-testid={testid} data-id={card.id} data-accent={offer ? "" : undefined}>
      <div className="k-row k-tile-head">
        <span className="k-ava" aria-hidden="true"><NdIcon name="me" /></span>
        <span className="k-meta">{say("app.feed.in_n", { n: card.like_count })}</span>
      </div>
      {offer
        ? <span className="k-badge-white k-corner" data-testid="offer"><NdIcon name="offer" /><span className="k-offer">{offerLabel(offer.discount_value)}</span></span>
        : <span className="k-badge" data-c={TONE_COLOUR[tone]} aria-hidden="true"><NdIcon name={MODE_ICON[card.mode] ?? "phrase"} /></span>}
      <button type="button" className="k-words" data-testid="card-open" onClick={onOpen} lang={langOf(card.lang)} data-size={textSize(card.text)}>{card.text}</button>
      <div className="k-foot">
        <span className="k-meta" data-testid="mode">{modeWord(card.mode)}{card.liked ? ` · ${say("app.feed.you_too")}` : ""}{card.farther_than_asked ? ` · ${say("app.feed.farther")}` : ""}</span>
        <button type="button" className="k-round" aria-label={say("web.card.like")} aria-pressed={card.liked === true} disabled={busy || card.liked === true}
          onClick={onLike} data-testid="tile-like" data-lit={card.liked ? "" : undefined}><NdIcon name={card.liked ? "imin" : "imin-off"} /></button>
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
export function CardScreen({ client, card, tone, more = [], onOpenMore, onTab, onTalk, onBack, onGone, onLike, onUnlike, needPhrase = false, onSay }: {
  client: Client;
  card: FeedCard;
  tone: Tone;
  /** Other phrases of the feed, shown under the card on the tablet sheet (tablet_834_Phrase: «more nearby»). */
  more?: Array<{ card: FeedCard; tone: Tone }>;
  onOpenMore?: (id: string) => void;
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
  const [outcome, setOutcome] = useState<LikeOutcome | null>(null);
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
  const need = needPhrase && !lit && !matched && !card.offer;
  const count = card.like_count + (lit && !card.liked ? 1 : 0);
  // the prototype's card (docs/newdesign/proto/card.html, card-in): the bar with back and «…», the phrase's panel, three
  // facts as tiles, and the action panel at the foot
  if (exit) {
    const page = <Offer code={exit} client={client} onBack={() => setExit(null)} />;
    // at the desktop the exit stands in the card's pane, as Me's sub-pages do (offer-exit.svg)
    return desk ? <div className="k-me-pane" data-testid="offer-pane"><InPane.Provider value={true}>{page}</InPane.Provider></div> : page;
  }
  return (
    <main className={desk ? "k-screen k-card-pane" : "k-screen k-over"} data-screen="card" data-id={card.id}>
      <div className="k-col">
        <header className="k-row k-bar">
          <button type="button" className="k-bar-btn" aria-label={say("common.back")} onClick={onBack} data-testid="back"><NdIcon name="back" /></button>
          <h1 className="k-bar-title">{label("web.card.phrase")}</h1>
          <button type="button" className="k-bar-btn" aria-label={say("web.card.more")} data-testid="more-menu"
            onClick={() => open("card-more", <MoreSheet client={client} card={card} onGone={onGone} />)}><NdIcon name="more" /></button>
        </header>
        <section className="k-panel k-card" data-tone={tone}>
          <div className="k-row">
            <span className="k-ava k-ava-big" aria-hidden="true"><NdIcon name="me" /></span>
            <div className="k-stack"><span className="k-sub">{modeWord(card.mode)}</span>{language && <span className="k-sub" lang={langOf(card.lang)}>{language}</span>}</div>
          </div>
          {card.offer
            ? <span className="k-badge-white k-corner" data-testid="offer"><NdIcon name="offer" /><span className="k-offer">{offerLabel(card.offer.discount_value)}</span></span>
            : <span className="k-badge k-badge-card" data-c="2" aria-hidden="true"><NdIcon name={MODE_ICON[card.mode] ?? "phrase"} /></span>}
          <p className="k-card-text" data-testid="text" lang={langOf(card.lang)} data-size={textSize(card.text)}>{card.text}</p>
          {card.offer?.venue_name && <span className="k-chip" data-testid="offer-venue">{card.offer.venue_name}</span>}
          {card.offer?.conditions && <p className="k-sub" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
          {matched && <p className="k-note" data-testid="matched" role="status"><NdIcon name="both" /><span><b>{say("app.card.matched_title")}</b> {peer ? say("app.card.matched_body", { name: peer }) : say("app.card.matched_body_anon")}</span></p>}
          {need && <p className="k-note" role="status" data-testid="need-phrase"><NdIcon name="phrase" /><span>{say("app.card.need")}</span></p>}
          {line && !matched && <p className="k-note" role="status" data-testid="like-line" data-state={outcome?.state}>{line}</p>}
        </section>
        <div className="k-facts">
          <div className="k-fact"><span className="k-badge" data-c="5"><NdIcon name={MODE_ICON[card.mode] ?? "alone"} /></span><span>{modeWord(card.mode)}</span></div>
          <div className="k-fact"><span className="k-badge" data-c="2"><NdIcon name="talks" /></span><span>{language ?? "—"}</span></div>
          <div className="k-fact" data-on={lit ? "" : undefined}><span className="k-badge" data-c="3"><NdIcon name={lit ? "imin" : "imin-off"} /></span><span>{say("app.feed.in_n", { n: count })}{card.soon ? say("web.card.soon") : ""}</span></div>
        </div>
        <section className={link ? "k-panel k-actions k-row" : "k-panel k-actions"}>
          {link && <button type="button" className="k-bar-btn" aria-label={say("app.offer.leaving")} onClick={() => setExit(link)} data-testid="offer-link"><NdIcon name="link" /></button>}
          {matched
            ? <button type="button" className="k-cta" onClick={onTalk} data-testid="talk"><NdIcon name="talks" /><span>{label("web.match.talk")}</span></button>
            : lit
              // card-in: «you're here» as an outline pill and the round «Take back» beside it
              ? <div className="k-row k-take">
                  <button type="button" className="k-cta" data-outline="" disabled aria-disabled="true" data-testid="like" data-lit=""><NdIcon name="imin" /><span>{say("app.feed.you_too")}</span></button>
                  {onUnlike && <button type="button" className="k-round" aria-label={say("app.card.take_back")} disabled={busy} onClick={() => void unlike()} data-testid="unlike"><NdIcon name="close" /></button>}
                </div>
              : need && onSay
                ? <button type="button" className="k-cta" onClick={onSay} data-testid="need-say"><NdIcon name="write" /><span>{say("app.card.need_say")}</span></button>
              : <button type="button" className="k-cta" disabled={busy} aria-disabled={busy} onClick={() => void like()} data-testid="like"><NdIcon name="imin" /><span>{say("app.feed.im_in")}</span></button>}
        </section>
        {more.length > 0 && (
          <section className="k-more-near" aria-label={say("app.feed.more_nearby")}>
            <ul className="k-grid2"><li><ul>{more.map((m) => <Tile key={m.card.id} card={m.card} tone={m.tone} busy={false} testid="card-near" onOpen={() => onOpenMore?.(m.card.id)} onLike={() => onOpenMore?.(m.card.id)} />)}</ul></li></ul>
          </section>
        )}
      </div>
      <TabBar active="feed" onSelect={onTab} railOnly />
    </main>
  );
}

type Panel = "menu" | "block" | "notice" | "noticed";

/** «…» of the card in a bottom sheet: Hide, Notice (Art. 16 DSA, as the web sends it), Block the author (asked twice). */
function MoreSheet({ client, card, onGone }: { client: Client; card: FeedCard; onGone: (why: "hidden" | "blocked", id: string, handle?: string) => void }) {
  const { close } = useLayers();
  const [panel, setPanel] = useState<Panel>("menu");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [bona, setBona] = useState(false);
  const [ref, setRef] = useState("");

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

  return (
    <div className="k-stack" data-testid="card-more" data-panel={panel}>
      <h2 className="k-sheet-title">{label("web.card.phrase")}</h2>
      {panel === "menu" && (
        <ul className="k-picks">
          <li><button type="button" className="k-pick k-pick-tall" disabled={busy} onClick={() => void hide()} data-testid="hide"><span className="k-badge k-badge-35" data-c="6"><NdIcon name="hide" /></span><span>{say("app.feed.hide")}</span></button></li>
          <li><button type="button" className="k-pick k-pick-tall" disabled={busy} onClick={() => setPanel("notice")} data-testid="notice"><span className="k-badge k-badge-35" data-c="3"><NdIcon name="flag" /></span><span>{say("web.card.notice")}</span></button></li>
          <li><button type="button" className="k-pick k-pick-tall" data-danger="" disabled={busy} onClick={() => setPanel("block")} data-testid="block"><span className="k-badge k-badge-35" data-c="5"><NdIcon name="block" /></span><span>{say("app.feed.block_author")}</span></button></li>
        </ul>
      )}
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
      {error && <p className="k-note" data-tone="error" role="alert" data-testid="error">{error}</p>}
    </div>
  );
}
