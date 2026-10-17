// The phrase card and what hangs on it (sosed Dusk sheets): the tile in the list (w1_feed, w1_feed-hidden-return,
// w1_feed-blocked), the card full-screen (w1_card, w1_card-liked, w1_card-matched), its «…» as a bottom sheet
// (w1_card-more: hide, notice, block the author). The calls are the SDK's: client.like / hide / blockByPhrase /
// request("POST", "/report"), as the web's useCard makes them. The same testids as the web's where it has them:
// card, offer, text, mode, like, more, hide, notice, block.
import { type FormEvent, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { label, LANG, say } from "../i18n";
import { Icon } from "../shell/Icon";
import { blockMark, chevronLeft, chevronRight, ellipsis, eyeOff, flag, hand } from "../shell/icons";
import { useLayers } from "../shell/layers";
import { type FeedCard, langOf, type LikeOutcome, offerLabel, type Tone } from "./feed-logic";

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

function Foot({ card }: { card: FeedCard }) {
  return (
    <div className="fd-foot">
      <span className="fd-in">
        <Icon d={hand} />
        <span>{say("app.feed.in_n", { n: card.like_count })}{card.liked ? ` · ${say("app.feed.you_too")}` : ""}</span>
      </span>
      <span className="fd-mode" data-testid="mode">{modeWord(card.mode)}</span>
    </div>
  );
}

/** A tile of the list: the whole tile opens the card, the hand likes at once. */
export function Tile({ card, tone, busy, onOpen, onLike }: { card: FeedCard; tone: Tone; busy: boolean; onOpen: () => void; onLike: () => void }) {
  return (
    <li className={`fd-card fd-${tone}`} data-testid="card" data-id={card.id}>
      {card.offer && <span className="fd-offer" data-testid="offer">{offerLabel(card.offer.discount_value)}</span>}
      <button type="button" className="fd-open" onClick={onOpen} lang={langOf(card.lang)}>{card.text}</button>
      <button type="button" className="fd-hand" aria-label={say("web.card.like")} aria-pressed={card.liked === true} disabled={busy || card.liked === true}
        onClick={onLike} data-testid="tile-like" data-lit={card.liked ? "" : undefined}>
        <Icon d={hand} />
      </button>
      <Foot card={card} />
    </li>
  );
}

/** The card full-screen over the feed: back, the phrase large, three rows, «I'm in». */
export function CardScreen({ client, card, tone, onBack, onGone, onLike }: {
  client: Client;
  card: FeedCard;
  tone: Tone;
  onBack: () => void;
  onGone: (why: "hidden" | "blocked", id: string, handle?: string) => void;
  onLike: (card: FeedCard) => Promise<LikeOutcome>;
}) {
  const { open } = useLayers();
  const [outcome, setOutcome] = useState<LikeOutcome | null>(null);
  const [busy, setBusy] = useState(false);
  const lit = card.liked === true || (outcome !== null && outcome.state !== "refused");
  const language = languageIn(card.lang);
  const line = likeLine(outcome);
  async function like() {
    setBusy(true);
    try { setOutcome(await onLike(card)); } finally { setBusy(false); }
  }
  return (
    <main className="fd-screen" data-screen="card" data-id={card.id}>
      <header className="fd-bar">
        <button type="button" className="fd-icon-btn" aria-label={say("common.back")} onClick={onBack} data-testid="back"><Icon d={chevronLeft} /></button>
        <h1>{label("web.card.phrase")}</h1>
        <button type="button" className="fd-icon-btn" aria-label={say("web.card.more")} data-testid="more-menu"
          onClick={() => open("card-more", <MoreSheet client={client} card={card} onGone={onGone} />)}><Icon d={ellipsis} /></button>
      </header>
      <section className="fd-body">
        <article className={`fd-card fd-big fd-${tone}`} data-id={card.id}>
          {card.offer && <span className="fd-offer" data-testid="offer">{offerLabel(card.offer.discount_value)}</span>}
          <p className="fd-text" data-testid="text" lang={langOf(card.lang)}>{card.text}</p>
          <span className="fd-hand fd-hand-static" data-lit={lit ? "" : undefined} aria-hidden="true"><Icon d={hand} /></span>
          <Foot card={lit && !card.liked ? { ...card, like_count: card.like_count + 1, liked: true } : card} />
        </article>
        {card.offer?.conditions && <p className="fd-note" data-testid="conditions">{say("web.card.conditions", { conditions: card.offer.conditions })}</p>}
        <dl className="fd-rows">
          <div><dt>{say("app.feed.row_going")}</dt><dd>{modeWord(card.mode)}</dd></div>
          {language && <div><dt>{say("app.feed.row_lang")}</dt><dd lang={langOf(card.lang)}>{language}</dd></div>}
          <div><dt>{say("app.feed.row_in")}</dt><dd>{card.like_count + (lit && !card.liked ? 1 : 0)}{card.soon ? say("web.card.soon") : ""}</dd></div>
        </dl>
        {line && <p className="fd-note" role="status" data-testid="like-line" data-state={outcome?.state}>{line}</p>}
      </section>
      <footer className="fd-foot-bar">
        <button type="button" className="cta cta-primary" disabled={busy || lit} aria-disabled={busy || lit} onClick={() => void like()} data-testid="like" data-lit={lit ? "" : undefined}>
          <Icon d={hand} /><span>{say("app.feed.im_in")}</span>
        </button>
      </footer>
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
    try { await run(); } catch (e) { setError(say("app.feed.act_failed", { message: (e as Error).message })); } finally { setBusy(false); }
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
      if (answer.status !== 202 || !answer.body?.id) throw new Error(say("web.card.notice_refused", { status: answer.status }));
      setRef(answer.body.id);
      setPanel("noticed");
    });
  }

  return (
    <div className="fd-sheet" data-testid="card-more" data-panel={panel}>
      <span className="fd-grab" aria-hidden="true" />
      <h2>{label("web.card.phrase")}</h2>
      {panel === "menu" && (
        <ul className="fd-menu">
          <li><button type="button" disabled={busy} onClick={() => void hide()} data-testid="hide"><Icon d={eyeOff} /><span>{say("app.feed.hide")}</span><Icon d={chevronRight} /></button></li>
          <li><button type="button" disabled={busy} onClick={() => setPanel("notice")} data-testid="notice"><Icon d={flag} /><span>{say("web.card.notice")}</span><Icon d={chevronRight} /></button></li>
          <li><button type="button" disabled={busy} className="fd-danger" onClick={() => setPanel("block")} data-testid="block"><Icon d={blockMark} /><span>{say("app.feed.block_author")}</span><Icon d={chevronRight} /></button></li>
        </ul>
      )}
      {panel === "block" && (
        <div className="fd-ask">
          <p>{say("web.card.block_warning")}</p>
          <div className="fd-ask-row">
            <button type="button" className="cta cta-quiet" disabled={busy} onClick={() => setPanel("menu")} data-testid="block-no">{say("web.card.block_no")}</button>
            <button type="button" className="cta cta-danger" disabled={busy} onClick={() => void block()} data-testid="block-yes">{say("web.card.block_yes")}</button>
          </div>
        </div>
      )}
      {panel === "notice" && (
        <form className="fd-ask" onSubmit={(e) => void notice(e)}>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={say("web.card.notice_reason")} aria-label={say("web.card.notice_reason")} rows={3} data-testid="notice-reason" />
          <label className="fd-check"><input type="checkbox" checked={bona} onChange={(e) => setBona(e.target.checked)} data-testid="notice-bona" /><span>{say("web.card.notice_bona")}</span></label>
          <div className="fd-ask-row">
            <button type="button" className="cta cta-quiet" disabled={busy} onClick={() => setPanel("menu")}>{say("web.card.cancel")}</button>
            <button type="submit" className="cta cta-primary" disabled={busy || !bona || reason.trim() === ""} data-testid="notice-send">{say("web.card.notice_send")}</button>
          </div>
        </form>
      )}
      {panel === "noticed" && (
        <div className="fd-ask">
          <p data-testid="noticed">{say("web.card.notice_sent", { ref })}</p>
          <button type="button" className="cta cta-quiet" onClick={close}>{say("common.back")}</button>
        </div>
      )}
      {error && <p className="fd-sheet-error" role="alert" data-testid="error">{error}</p>}
    </div>
  );
}
