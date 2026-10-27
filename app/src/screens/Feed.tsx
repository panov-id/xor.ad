// The feed (sosed Dusk: w1_feed, w1_feed-error, w1_feed-hidden-return, w1_feed-blocked, w2_feed-empty; the card and its
// «…» are feed-card.tsx). The cards of the circle the viewer names, thirty at a time and more by cursor (protocol §6),
// through the SDK the unlock seated (client.feed, hide/unhide, blockByPhrase) — the web's calls, web screens/Feed.tsx
// and screens/logic/useFeed.ts, in this shell's frame. The same testids: cards, card, loading, error, quiet, more,
// gone (data-why), hidden-undo, hidden-undo-error; new ones: retry, wider, radius-<m>.
//
// The «say it» chip opens the composer (Composer.tsx, w3_composer). The header has the sheet's two icons: the search (a filter over
// the phrases already loaded, no node call) and the menu (feed-menu.tsx); under the title the density step (client.density, never a
// number); a table the node puts between the phrases is a row that opens it (tablet_834_Feed); one's own phrase just sent stands over
// the list with its «take down» (client.takeDown). Not here yet: the place picker (docs/newsdesign/place-flow.svg waits for the owner);
// the sheet's numbers in the radius chips (the node gives a step, never a count) and the distance and age on the tile (the feed has none).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Client, Radius } from "@sdk/client.ts";
import { failedLine, label, say } from "../i18n";
import { storedPlace } from "../place";
import { Icon } from "../shell/Icon";
import { close as closeIcon, flag, map, menu, pen, refresh, search, undo } from "../shell/icons";
import { useLayers } from "../shell/layers";
import { useSkeleton } from "../shell/loading";
import { Skeleton } from "../shell/Skeleton";
import { type Tab, TabBar } from "../shell/TabBar";
import { useMinWidth } from "../shell/useMinWidth";
import { CardScreen, likeLine, TableTile, Tile } from "./feed-card";
import { Scene } from "../shell/Scene";
import { RADIUS_ICON, radiusText, RadiusSheet } from "./feed-radius";
import { NdIcon } from "../shell/NdIcon";
import {
  cardEntry, cardOf, feedRows, type FeedCard, type Gone, likeOutcome, type LikeOutcome, mergePage, RADII, radiusWord, type SentPhrase, type Step, stepKey, stepOf, takedownVerdict, UNDO_HIDE_MS, widerRadius, withLike, withoutCard,
} from "./feed-logic";
import { lineOf, TableRow } from "./tables/table-row";

/** How many columns the list has: the CSS says (--fd-cols in tokens/wide.css), the page follows it as the window changes. */
function useColumns(ref: { current: HTMLElement | null }): number {
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

export function Feed({ client, onTab, onCompose, sent = null, onTakenDown, onLikes, onTable, onPlace }: {
  client: Client; onTab?: (tab: Tab) => void; onCompose?: (radius: Radius) => void;
  /** One's own phrase just sent (Composer's answer), shown over the list until it is taken down or the feed is left. */
  sent?: SentPhrase | null; onTakenDown?: () => void;
  /** The menu's ways out: the likes I gave, a new table; a table row opens its table. */
  onLikes?: () => void; onNewTable?: () => void; onTable?: (id: string) => void; onPlace?: () => void;
}) {
  const { open: openSheet, close: closeSheet } = useLayers();
  const wide = useMinWidth("--bp-tablet");
  const [step, setStep] = useState<Step | null>(null);
  const [takingDown, setTakingDown] = useState(false);
  const [takedownRefused, setTakedownRefused] = useState<number | null>(null);
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

  // The step under the circle (GET /feed/density): one word, never the number; a refusal keeps the step it had.
  useEffect(() => {
    let live = true;
    client.density({ lat: place.lat, lon: place.lon, radius })
      .then((answer) => { const s = stepOf(answer.status, answer.body); if (live && s) setStep(s); })
      .catch(() => {});
    return () => { live = false; };
  }, [radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // My own phrase comes down (DELETE /feed/:id, web useFeed takeDown): a refusal is said under the line with the node's number.
  async function takeDown() {
    if (!sent?.id) return;
    setTakingDown(true);
    setTakedownRefused(null);
    const verdict = takedownVerdict(await client.takeDown(sent.id).then((a) => a.status, () => 0));
    setTakingDown(false);
    if (verdict.ok) onTakenDown?.(); else setTakedownRefused(verdict.status);
  }

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

  const rows = feedRows(items, gone, "");   // the prototype's feed has no search
  const phrases = rows.filter((r) => r.tone !== null);
  const widerTo = widerRadius(radius);
  const card = opened ? items.find((c) => c.id === opened) ?? null : null;
  const title = say("app.feed.title", { place: place.chosen ? place.name : say("web.place.none") });
  const note = likeLine(likeNote);

  return (
    <>
      {/* the prototype's feed (docs/newdesign/proto/feed.html and its states): the scene with the place panel over it, the
          phrases / marks switch, the list panel cut round «write», the bottom bar */}
      <main className="k-screen" data-screen="feed" inert={card ? true : undefined}>
        <div className="k-col">
          <Scene>
            <section className="k-panel">
              <div className="k-row">
                <NdIcon name="place" className="k-pin" />
                <div className="k-stack">
                  <h1 className="k-title">{title}</h1>
                  {step ? <p className="k-sub" role="status" data-testid="nearby" data-step={step}>{say(stepKey(step))}</p> : <p className="k-sub">{radiusText(radius)}</p>}
                </div>
                <button type="button" className="k-chip" aria-label={`${say("web.feed.radius")}: ${radiusText(radius)}`} data-testid="radius-open"
                  onClick={() => openSheet("radius", <RadiusSheet radius={radius} onPick={(r) => { setLikeNote(null); setRadius(r); closeSheet(); }} onPlace={onPlace && (() => { closeSheet(); onPlace(); })} />)}>
                  <NdIcon name={RADIUS_ICON[radius]} /><NdIcon name="down" className="k-caret" />
                </button>
              </div>
            </section>
          </Scene>
          <div className="k-seg" role="tablist">
            <button type="button" role="tab" aria-selected="true" aria-label={say("app.feed.phrases")} data-testid="seg-feed"><NdIcon name="phrase" /></button>
            <button type="button" role="tab" aria-selected="false" aria-label={say("liked.title")} onClick={onLikes} data-testid="seg-likes"><NdIcon name="imin" /></button>
          </div>
          <section className="k-body" data-fab={onCompose ? "" : undefined}>
            {sent && (
              <div className="k-note" data-testid="sent" data-state={sent.state}>
                <NdIcon name="hourglass" />
                <span>{say(sent.state === "published" ? "web.feed.sent_out" : "web.feed.sent_held")} «{sent.text}»</span>
                {sent.id && <button type="button" className="k-icon-btn" aria-label={say("feed.takedown")} disabled={takingDown} onClick={() => void takeDown()} data-testid="takedown"><NdIcon name="close" /></button>}
              </div>
            )}
            {sent && takedownRefused !== null && <p className="k-note" data-tone="error" role="alert" data-testid="takedown-refused">{say("feed.takedownRefused", { status: takedownRefused })}</p>}
            {gone?.why === "hidden" && undoing && (
              <div className="k-note" data-testid="gone" data-why="hidden">
                <NdIcon name="hide" /><span>{say("app.feed.hidden_gone")}</span>
                <button type="button" className="k-btn" onClick={bringBack} data-testid="hidden-undo"><span>{say("web.feed.hidden_undo")}</span></button>
              </div>
            )}
            {undoError && <p className="k-note" data-tone="error" role="alert" data-testid="hidden-undo-error">{undoError}</p>}
            {gone?.why === "blocked" && <p className="k-note" data-testid="gone" data-why="blocked"><NdIcon name="block" /><span>{say("web.feed.blocked")}</span></p>}
            {note && <p className="k-note" role="status" data-testid="like-note">{note}</p>}
            {state === "failed" && (
              <div className="k-empty" data-testid="error">
                <NdIcon name="wifi-off" className="k-empty-mark" />
                <h2 role="alert">{say("app.feed.err_title")}</h2><p>{say("app.feed.err_body")}</p>
                <button type="button" className="k-btn" onClick={() => void load()} data-testid="retry"><NdIcon name="refresh" /><span>{say("app.feed.retry")}</span></button>
              </div>
            )}
            {state === "ready" && rows.length === 0 && (
              <div className="k-empty" data-testid="quiet">
                <NdIcon name="empty" className="k-empty-mark" />
                <h2>{say("web.feed.empty")}</h2><p>{say("app.feed.empty_hint")}</p>
                {widerTo && (
                  <button type="button" className="k-btn" onClick={() => setRadius(widerTo)} data-testid="wider">
                    <NdIcon name={RADIUS_ICON[widerTo]} /><span>{label("web.feed.wider", { radius: radiusText(widerTo) })}</span>
                  </button>
                )}
              </div>
            )}
            <div className="k-grid2" ref={listRef} data-testid="cards">
              {Array.from({ length: columns }, (_, col) => (
                <ul key={col}>
                  {rows.map(({ card: c, tone }, i) => i % columns === col && (tone === null
                    ? <TableTile key={c.id} card={c} onOpen={onTable && (() => onTable(c.id))} />
                    : <Tile key={c.id} card={c} tone={tone} busy={liking === c.id} onOpen={() => openCard(c.id)} onLike={() => void likeFromTile(c)} />
                  ))}
                </ul>
              ))}
            </div>
            {skeleton && <div className="k-grid2" data-testid="loading"><ul><li className="k-tile k-ghost" /></ul><ul><li className="k-tile k-ghost" /></ul></div>}
            {next && state === "ready" && <button type="button" className="k-btn" onClick={() => void load(next)} data-testid="more">{say("app.feed.more_cards")}</button>}
          </section>
          <TabBar active="feed" onSelect={onTab} />
        </div>
        {onCompose && (
          <button type="button" className="k-fab" onClick={() => onCompose(radius)} aria-label={say("app.compose.title")} data-testid="write"><NdIcon name="write" /></button>
        )}
      </main>
      {card && (
        <CardScreen
          client={client}
          card={card}
          more={phrases.filter((r) => r.card.id !== card.id).slice(0, 2).map((r) => ({ card: r.card, tone: r.tone! }))}
          onOpenMore={openCard}
          onTab={onTab}
          tone={phrases.find((r) => r.card.id === card.id)?.tone ?? "lime"}
          onTalk={() => onTab?.("chats")}
          onBack={closeCard}
          onLike={like}
          onGone={(why, id, handle) => { closeCard(); setOpened(null); setLikeNote(null); setGone({ why, id, handle }); }}
        />
      )}
    </>
  );
}
