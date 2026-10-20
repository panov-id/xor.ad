// The feed (sosed Dusk: w1_feed, w1_feed-error, w1_feed-hidden-return, w1_feed-blocked, w2_feed-empty; the card and its
// «…» are feed-card.tsx). The cards of the circle the viewer names, thirty at a time and more by cursor (protocol §6),
// through the SDK the unlock seated (client.feed, hide/unhide, blockByPhrase) — the web's calls, web screens/Feed.tsx
// and screens/logic/useFeed.ts, in this shell's frame. The same testids: cards, card, loading, error, quiet, more,
// gone (data-why), hidden-undo, hidden-undo-error; new ones: retry, wider, radius-<m>.
//
// The «say it» chip opens the composer (Composer.tsx, w3_composer). Not here yet: the place picker, search/menu in the header, the density line,
// the tables between phrases (a table item is skipped), one's own sent phrase over the list.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Client, Radius } from "@sdk/client.ts";
import { failedLine, label, say } from "../i18n";
import { storedPlace } from "../place";
import { Icon } from "../shell/Icon";
import { flag, map, pen, refresh, undo } from "../shell/icons";
import { useSkeleton } from "../shell/loading";
import { Skeleton } from "../shell/Skeleton";
import { type Tab, TabBar } from "../shell/TabBar";
import { CardScreen, likeLine, Tile } from "./feed-card";
import {
  cardEntry, cardOf, type FeedCard, type Gone, likeOutcome, type LikeOutcome, mergePage, RADII, radiusWord, toneOf, UNDO_HIDE_MS, visibleCards, widerRadius, withLike, withoutCard,
} from "./feed-logic";

const radiusText = (r: Radius): string => {
  const w = radiusWord(r);
  return say(w.key, { n: w.n });
};

/** How many columns the list has: the CSS says (--fd-cols in tokens/wide.css), the page follows it as the window changes. */
function useColumns(ref: { current: HTMLElement | null }): number {
  const [n, setN] = useState(1);
  useLayoutEffect(() => {
    const read = () => {
      if (!ref.current) return;
      const v = parseInt(getComputedStyle(ref.current).getPropertyValue("--fd-cols"), 10);
      setN(v >= 1 ? v : 1);
    };
    read();
    addEventListener("resize", read);
    return () => removeEventListener("resize", read);
  }, [ref]);
  return n;
}

export function Feed({ client, onTab, onCompose }: { client: Client; onTab?: (tab: Tab) => void; onCompose?: (radius: Radius) => void }) {
  const place = useRef(storedPlace()).current;
  const [radius, setRadius] = useState<Radius>(1000);
  const [items, setItems] = useState<FeedCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [gone, setGone] = useState<Gone | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [liking, setLiking] = useState<string | null>(null);
  const [likeNote, setLikeNote] = useState<LikeOutcome | null>(null);
  const skeleton = useSkeleton(state === "loading");
  const listRef = useRef<HTMLDivElement>(null);
  const columns = useColumns(listRef);

  // The system Back closes an open card, it does not leave the feed: opening pushes an entry, the popstate lands the
  // card from the entry now under it, and the card's own «back» is that same Back (history.back) so the entry goes too.
  // Back is asynchronous: until its popstate lands, the card's entry is still current, so a tap then would be eaten by it.
  const goingBack = useRef(false);
  function openCard(id: string) {
    if (goingBack.current) return;
    // Already on a card's entry (a second tap before the redraw): swap the card, never stack a second entry Back must eat.
    if (cardOf(history.state)) history.replaceState({ ...history.state, card: id }, "", location.href);
    else history.pushState(cardEntry(history.state, id), "", location.href);
    setOpened(id);
  }
  function closeCard() {
    if (cardOf(history.state)) { goingBack.current = true; history.back(); }
    else setOpened(null);
  }
  useEffect(() => {
    // After a reload the card is gone from the screen but its entry is not; drop the name so Back past it opens nothing.
    if (cardOf(history.state)) history.replaceState(withoutCard(history.state), "", location.href);
    const onPop = () => { goingBack.current = false; setOpened(cardOf(history.state)); };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // A page asked before the radius changed is stale: its answer would mix the old circle into the new one (web
  // useFeed, D2). Every radius starts a generation; only an answer of the current one is drawn.
  const generation = useRef(0);
  async function load(after?: string) {
    const mine = generation.current;
    setState("loading");
    try {
      const page = await client.feed({ lat: place.lat, lon: place.lon, radius, after });
      if (mine !== generation.current) return;
      setItems((was) => mergePage(was, page.items as FeedCard[], after));
      setNext(page.next ?? null);
      setState("ready");
    } catch {
      if (mine !== generation.current) return;
      setState("failed");
    }
  }
  useEffect(() => {
    generation.current += 1;
    void load();
    return () => { generation.current += 1; };
  }, [radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // «hidden · return» stands UNDO_HIDE_MS after a phrase was hidden (owner 14.10.2026), then goes; the phrase stays
  // hidden — «Me → hidden → return» still brings it back.
  useEffect(() => {
    setUndoError(null);
    if (gone?.why !== "hidden") { setUndoing(false); return; }
    setUndoing(true);
    const timer = setTimeout(() => setUndoing(false), UNDO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [gone]);
  function bringBack() {
    if (!gone?.handle) return;
    client.unhide(gone.handle)
      .then((answer) => {
        if (answer.status !== 204 && answer.status !== 200) throw new Error(`${answer.status}`);
        setUndoing(false);
        setGone(null);
        void load();
      })
      .catch((e: Error) => setUndoError(failedLine(e)));
  }

  // The hand and «I'm in»: POST /feed/:id/like; the card in the list takes the like at once (the node's count comes with the next page).
  async function like(card: FeedCard): Promise<LikeOutcome> {
    setLiking(card.id);
    try {
      const answer = await client.like(card.id);
      const outcome = likeOutcome(answer.status, answer.body);
      if (outcome.state !== "refused") setItems((was) => was.map((c) => (c.id === card.id ? withLike(c) : c)));
      return outcome;
    } catch {
      return { state: "refused", cause: "other", status: 0 };
    } finally {
      setLiking(null);
    }
  }
  async function likeFromTile(card: FeedCard) {
    const outcome = await like(card);
    setLikeNote(outcome.state === "liked" ? null : outcome);
  }

  const cards = visibleCards(items, gone);
  const widerTo = widerRadius(radius);
  const card = opened ? items.find((c) => c.id === opened) ?? null : null;
  const title = say("app.feed.title", { place: place.chosen ? place.name : say("web.place.none") });
  const note = likeLine(likeNote);

  return (
    <>
      <main className="screen fd-feed" data-screen="feed" inert={card ? true : undefined}>
        <div className="fd-panel">
        <header className="fd-head">
          <span className="fd-brand word" aria-hidden="true">sosed</span>
          <ul className="fd-chips" aria-label={say("web.feed.radius")}>
            {RADII.map((r) => (
              <li key={r}>
                <button type="button" className="fd-chip" aria-pressed={r === radius} onClick={() => { setLikeNote(null); setRadius(r); }} data-testid={`radius-${r}`}>
                  {radiusText(r)}
                </button>
              </li>
            ))}
          </ul>
          <h1>{title}</h1>
        </header>
        <section className="sheet-content fd-list">
          {gone?.why === "hidden" && undoing && (
            <div className="fd-undo" data-testid="gone" data-why="hidden">
              <span>{say("app.feed.hidden_gone")}</span>
              <button type="button" className="fd-return" onClick={bringBack} data-testid="hidden-undo"><Icon d={undo} /><span>{say("web.feed.hidden_undo")}</span></button>
            </div>
          )}
          {undoError && <p className="fd-line fd-line-error" role="alert" data-testid="hidden-undo-error">{undoError}</p>}
          {gone?.why === "blocked" && <p className="fd-hint" data-testid="gone" data-why="blocked">{say("web.feed.blocked")}</p>}
          {note && <p className="fd-line" role="status" data-testid="like-note">{note}</p>}

          {state === "failed" && (
            <div className="fd-fail" data-testid="error">
              <div className="fd-banner" role="alert">
                <Icon d={flag} />
                <div><strong>{say("app.feed.err_title")}</strong><p>{say("app.feed.err_body")}</p></div>
              </div>
              <button type="button" className="cta cta-quiet" onClick={() => void load()} data-testid="retry"><Icon d={refresh} /><span>{say("app.feed.retry")}</span></button>
            </div>
          )}

          {state === "ready" && cards.length === 0 && (
            <div className="fd-empty" data-testid="quiet">
              <span className="fd-empty-icon" aria-hidden="true"><Icon d={map} /></span>
              <h2>{say("web.feed.empty")}</h2>
              <p>{say("app.feed.empty_hint")}</p>
              {widerTo && (
                <button type="button" className="fd-wider" onClick={() => setRadius(widerTo)} data-testid="wider">
                  <Icon d={map} /><span>{label("web.feed.wider", { radius: radiusText(widerTo) })}</span>
                </button>
              )}
            </div>
          )}

          {/* One column on a phone; on the wide sheets the tiles go to the columns by turns (the sheets' masonry), the count is tokens/wide.css's --fd-cols. */}
          <div className="fd-cards" ref={listRef} data-testid="cards">
            {Array.from({ length: columns }, (_, col) => (
              <ul className="fd-col" key={col}>
                {cards.map((c, i) => i % columns === col && (
                  <Tile key={c.id} card={c} tone={toneOf(c, i)} busy={liking === c.id} onOpen={() => openCard(c.id)} onLike={() => void likeFromTile(c)} />
                ))}
              </ul>
            ))}
          </div>
          {state === "loading" && skeleton && (
            <div className="fd-skeletons" data-testid="loading"><Skeleton kind="card" /><Skeleton kind="card" /></div>
          )}
          {next && state === "ready" && (
            <button type="button" className="cta cta-quiet" onClick={() => void load(next)} data-testid="more">{say("app.feed.more_cards")}</button>
          )}
        </section>
        </div>
        {/* «Say it» over the bar (w3_composer's way in): the composer opens with the feed's circle, the web's testid. */}
        {onCompose && (
          <button type="button" className="fd-say" onClick={() => onCompose(radius)} aria-label={say("app.compose.title")} data-testid="write"><Icon d={pen} /></button>
        )}
        <TabBar active="feed" onSelect={onTab} />
      </main>
      {card && (
        <CardScreen
          client={client}
          card={card}
          more={cards.filter((c) => c.id !== card.id).slice(0, 2).map((c) => ({ card: c, tone: toneOf(c, cards.indexOf(c)) }))}
          onOpenMore={openCard}
          onTab={onTab}
          tone={toneOf(card, Math.max(0, cards.findIndex((c) => c.id === card.id)))}
          onBack={closeCard}
          onLike={like}
          onGone={(why, id, handle) => { closeCard(); setOpened(null); setLikeNote(null); setGone({ why, id, handle }); }}
        />
      )}
    </>
  );
}
