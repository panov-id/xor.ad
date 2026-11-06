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
import { type CSSProperties, useEffect, useRef, useState } from "react";
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
import { LikesBody } from "./talks/Likes";
import { CardScreen, likeLine, OwnTile, TableTile, Tile, useColumns } from "./feed-card";
import { MyPhrase } from "./MyPhrase";
import { RADIUS_ICON, radiusText, RadiusSheet } from "./feed-radius";
import { NdIcon } from "../shell/NdIcon";
import { FeedHead } from "../nd4/screens/feed-head.gen";
import { AdNative } from "../nd4/screens/ad.gen";
import { FeedOffline, FeedQuiet } from "../nd4/screens/feed-states.gen";
import { ADS_ON, adFor } from "../shell/ads";
import { withAd } from "../shell/ads-logic";
import { FeedHidden } from "../nd4/screens/feed-hidden.gen";
import { FeedLoading } from "../nd4/screens/feed-loading.gen";
import { FeedLoadingLaptop } from "../nd4/screens/feed-loading-laptop.gen";
import { FeedLoadingTablet } from "../nd4/screens/feed-loading-tablet.gen";
import { useDrawing } from "../nd4/drawing";
import {
  cardEntry, cardOf, feedRows, type FeedCard, type Gone, likeOutcome, type LikeOutcome, mergePage, radiusWord, type SentPhrase, type Step, stepKey, stepOf, takedownVerdict, UNDO_HIDE_MS, widenedTo, noteWidened, widerRadius, withLike, withoutCard, withoutLike, ownLive,
} from "./feed-logic";
import { lineOf, TableRow } from "./tables/table-row";

/** The head's «more» (owner, 28.10): likes I gave, a new table, the place. Testids: feed-menu, menu-likes, menu-table, menu-place. */
function FeedMenu({ onLikes, onNewTable, onPlace }: { onLikes?: () => void; onNewTable?: () => void; onPlace?: () => void }) {
  const items = [
    { id: "menu-likes", icon: "imin", text: say("app.likes.title"), go: onLikes },
    { id: "menu-table", icon: "tables", text: say("app.tables.start"), go: onNewTable },
    { id: "menu-place", icon: "place", text: say("app.feed.place"), go: onPlace },
  ];
  return (
    <div className="k-stack" data-testid="feed-menu">
      <h2 className="k-sheet-title">{say("app.feed.menu")}</h2>
      <ul className="k-picks">
        {items.map((m) => m.go && (
          <li key={m.id}><button type="button" className="k-pick" onClick={m.go} data-testid={m.id}><span className="k-badge" data-c="2"><NdIcon name={m.icon} /></span><span>{m.text}</span></button></li>
        ))}
      </ul>
    </div>
  );
}

export function Feed({ client, onTab, onCompose, sent = null, onTakenDown, onLikes, onNewTable, onTable, onPlace }: {
  client: Client; onTab?: (tab: Tab) => void; onCompose?: (radius: Radius) => void;
  /** One's own phrase just sent (Composer's answer), shown over the list until it is taken down or the feed is left. */
  sent?: SentPhrase | null; onTakenDown?: () => void;
  /** The menu's ways out: the likes I gave, a new table; a table row opens its table. */
  onLikes?: () => void; onNewTable?: () => void; onTable?: (id: string) => void; onPlace?: () => void;
}) {
  const { open: openSheet, close: closeSheet } = useLayers();
  const wide = useMinWidth("--bp-tablet");
  const drawing = useDrawing();
  const Ghosts = drawing === "laptop" ? FeedLoadingLaptop : drawing === "tablet" ? FeedLoadingTablet : FeedLoading;
  // my-marks at 1440/1920: the desktop shows the likes in the feed's body under the feed's head; the phone opens the likes screen
  const desk = useMinWidth("--bp-desktop");
  const [likesOn, setLikesTab] = useState(false);
  const likesTab = desk && likesOn; // a window shrunk under the desktop drops back to the feed
  const [step, setStep] = useState<Step | null>(null);
  const [takingDown, setTakingDown] = useState(false);
  const [takedownRefused, setTakedownRefused] = useState<number | null>(null);
  const place = useRef(storedPlace()).current;
  const [radius, setRadius] = useState<Radius>(1000);
  // the phone's radius chip and, at 1440+, a second press on the pressed round radius (radius.svg) open the same sheet
  const radiusSheet = () => openSheet("radius", <RadiusSheet radius={radius} onPick={(r) => { setLikeNote(null); setRadius(r); closeSheet(); }} onPlace={onPlace && (() => { closeSheet(); onPlace(); })} />);
  const [items, setItems] = useState<FeedCard[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [gone, setGone] = useState<Gone | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  // card-need (owner 28.10): a like needs a live phrase of one's own (routes/likes.ts, 409). The profile's phrases with an
  // end still ahead are the live ones (routes/identity.ts: one waiting for the queue has none), so the card says «say yours
  // first» before the press; a 409 on a like asks the profile again.
  const [needPhrase, setNeedPhrase] = useState(false);
  const [own, setOwn] = useState<Array<{ id: string; expires_at?: number }>>([]);
  const checkOwn = () => client.profile().then((p) => { setOwn(p?.phrases ?? []); setNeedPhrase(!ownLive(p?.phrases, Date.now())); }).catch(() => {});
  useEffect(() => { void checkOwn(); }, [client, sent]);
  const [liking, setLiking] = useState<string | null>(null);
  const [likeNote, setLikeNote] = useState<LikeOutcome | null>(null);
  const [query, setQuery] = useState<string | null>(null);   // null: the search is closed
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
  const [widened, setWidened] = useState<number | null>(null);
  async function load(after?: string) {
    const mine = generation.current;
    setState("loading");
    try {
      const page = await client.feed({ lat: place.lat, lon: place.lon, radius, after });
      if (mine !== generation.current) return;
      setItems((was) => mergePage(was, page.items as FeedCard[], after));
      if (!after) { const w = widenedTo(radius, page as { radius_used?: unknown }); setWidened(w); noteWidened(radius, w); }
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
  async function takeDown(id: string) {
    if (takingDown) return;
    setTakingDown(true);
    setTakedownRefused(null);
    const verdict = takedownVerdict(await client.takeDown(id).then((a) => a.status, () => 0));
    setTakingDown(false);
    if (!verdict.ok) { setTakedownRefused(verdict.status); return; }
    setItems((was) => was.filter((c) => c.id !== id));
    if (sent?.id === id) onTakenDown?.();
    closeCard();
    void checkOwn();
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
      if (outcome.state === "refused" && outcome.status === 409) void checkOwn();
      if (outcome.state !== "refused") setItems((was) => was.map((c) => (c.id === card.id ? withLike(c) : c)));
      return outcome;
    } catch {
      return { state: "refused", cause: "other", status: 0 };
    } finally {
      setLiking(null);
    }
  }
  // card-in «Take back» (owner 28.10): DELETE /feed/:id/like; «unliked» lowers the card at once, «spent» (a match came of it) keeps it.
  async function unlike(card: FeedCard): Promise<boolean> {
    setLiking(card.id);
    try {
      const answer = await client.unlike(card.id);
      const taken = answer.status === 200 && answer.body?.state === "unliked";
      if (taken) setItems((was) => was.map((c) => (c.id === card.id ? withoutLike(c) : c)));
      return taken;
    } catch {
      return false;
    } finally {
      setLiking(null);
    }
  }
  async function likeFromTile(card: FeedCard) {
    const outcome = await like(card);
    setLikeNote(outcome.state === "liked" ? null : outcome);
  }

  // the feed's list without one's just-sent phrase (its own tile stands first); a failed load shows no old phrases, they may be gone (spec 27)
  const rows = state === "failed" ? [] : feedRows(items, gone, query ?? "").filter((r) => !sent?.id || r.card.id !== sent.id);
  const searching = !!query?.trim();
  const phrases = rows.filter((r) => r.tone !== null);
  const widerTo = widerRadius(radius);
  const card = opened ? items.find((c) => c.id === opened) ?? null : null;
  const placeName = place.chosen ? place.name : say("web.place.none");
  const note = likeLine(likeNote);
  const quiet = state === "ready" && !searching && rows.length === 0 && !sent;   // spec 26: the quiet screen's own button replaces «write»
  const sentKey = sent ? sent.id ?? "sent" : null;
  const openOwn = opened !== null && (opened === sentKey || own.some((f) => f.id === opened));
  const ownCard = opened ? items.find((c) => c.id === opened) : undefined;
  const ownText = opened === sentKey ? sent?.text : ownCard?.text;
  if (openOwn && ownText !== undefined) {
    // docs/newdesign4 screen 37: one's own phrase, in place of the feed; the card screen is someone else's phrase
    return <MyPhrase text={ownText} lang={ownCard?.lang} checking={opened === sentKey && sent?.state === "checking"} expiresAt={own.find((f) => f.id === opened)?.expires_at}
      likes={ownCard?.like_count ?? 0} refusedStatus={takedownRefused} onBack={() => { setTakedownRefused(null); closeCard(); }}
      onDelete={opened === "sent" ? undefined : () => void takeDown(opened)} onNew={onCompose ? () => onCompose(radius) : undefined} />;
  }

  return (
    <>
      {/* the prototype's feed (docs/newdesign/proto/feed.html and its states): the scene with the place panel over it, the
          phrases / marks switch, the list panel cut round «write», the bottom bar */}
      {/* a phrase over the feed shuts it (the phone); at the desk it stands in the right pane and the rail stays live
          (crowd flow-1028-223505: Nino at 1920 could not press «Me» with a phrase open) */}
      <main className="k-screen" data-screen="feed" inert={card && !desk ? true : undefined}>
        <div className="k-col">
          {/* newdesign3 .uhead (frontend/screens/feed.html, plan A item 3): the «nearby» lead, the title pill «nearby» over
              «place · km», the round place button (it opens the radius sheet, whose last row is the place). The kit's «· people»
              is not drawn: the node gives a step, never a count. Search and menu stay round; the five radii show at 1920 only. */}
          {/* newdesign4 screen 283's head row (nd4/screens/feed-head.gen.tsx). The archive's row has no search and no menu: they
              stay in its `extra` slot until screen 43's way in is known (brief, 01.11). «?» waits for the help screens 34-35. */}
          <header data-testid="feed-head">
            {query === null ? (
              <FeedHead name={placeName} sub={`· ${radiusText(radius)}`} placeLabel={say("app.feed.place_radius", { r: radiusText(radius) })} onPlace={radiusSheet}
                likedLabel={say("app.likes.title")} likedOn={likesTab} onLiked={() => (desk ? setLikesTab(!likesOn) : onLikes?.())}
                extra={<>
                  <button type="button" className="k-uhead-btn" aria-label={say("app.feed.search")} aria-expanded={false} onClick={() => setQuery("")} data-testid="search-open"><NdIcon name="search" /></button>
                  <button type="button" className="k-uhead-btn" aria-label={say("app.feed.menu")} onClick={() => openSheet("menu", <FeedMenu onLikes={onLikes && (() => { closeSheet(); onLikes(); })} onNewTable={onNewTable && (() => { closeSheet(); onNewTable(); })} onPlace={onPlace && (() => { closeSheet(); onPlace(); })} />)} data-testid="feed-more"><NdIcon name="more" /></button>
                </>} />
            ) : (
              <div className="k-row k-search">
                <input type="search" className="k-field" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} aria-label={say("app.feed.search")} placeholder={say("app.feed.search")} data-testid="search" />
                <button type="button" className="k-icon-btn" aria-label={say("app.feed.search_close")} onClick={() => setQuery(null)} data-testid="search-close"><NdIcon name="close" /></button>
              </div>
            )}
            {step && <p className="k-meta" role="status" data-testid="nearby" data-step={step}>{say(stepKey(step))}</p>}
          </header>
          <section className="k-body">
            {likesTab ? <LikesBody client={client} onGo={() => setLikesTab(false)} /> : <>
            {undoError && <p className="k-note" data-tone="error" role="alert" data-testid="hidden-undo-error">{undoError}</p>}
            {gone?.why === "blocked" && <p className="k-note" data-testid="gone" data-why="blocked"><NdIcon name="block" /><span>{say("web.feed.blocked")}</span></p>}
            {note && <p className="k-note" role="status" data-testid="like-note">{note}</p>}
            {state === "failed" && (
              <FeedOffline title={say("app.feed.err_title")} body={say("app.feed.err_body")} retryLabel={say("app.feed.retry")} onRetry={() => void load()} />
            )}
            {state === "ready" && widened !== null && rows.length > 0 && (() => { const w = radiusWord(widened); return (
              <p className="k-note" role="status" data-testid="feed-widened" data-radius={widened}>{say("app.feed.widened", { r: say(w.key, { n: w.n }) })}</p>
            ); })()}
            {state === "ready" && searching && rows.length === 0 && <p className="k-sub" role="status" data-testid="search-none">{say("app.feed.search_none")}</p>}
            {quiet && (
              <FeedQuiet title={say("app.feed.quiet_title")} body={say("app.feed.quiet_body", { r: radiusText(radius) })}
                sayLabel={say("app.feed.quiet_say")} onSay={onCompose ? () => onCompose(radius) : undefined}
                widerLabel={widerTo ? say("app.feed.quiet_wider", { r: radiusText(widerTo) }) : undefined} onWider={widerTo ? () => setRadius(widerTo) : undefined} ad={adFor("quiet-feed")} />
            )}
            <div className="k-grid2" ref={listRef} data-testid="cards">
              {Array.from({ length: columns }, (_, col) => (
                <ul key={col}>
                  {col === 0 && sent && !searching && state !== "failed" && (sent.state === "checking"
                    ? <OwnTile id={sent.id} text={sent.text} onOpen={() => openCard(sentKey!)} />
                    : <Tile card={{ id: sentKey!, text: sent.text, like_count: 0, mode: "alone", kind: "phrase" } as FeedCard} tone="lime" busy={false} testid="sent" dist={say("app.my.here")} onOpen={() => openCard(sentKey!)} onLike={() => {}} />)}
                  {withAd(rows, ADS_ON).map((r, i) => i % columns === col && (r === null
                    ? <li key="ad-native" style={{ display: "contents" }}><AdNative sponsored={say("app.ad.sponsored")} slot={say("app.ad.slot")} text={say("app.ad.native_text")} note={say("app.ad.native_note")} /></li>
                    : r.tone === null
                      ? <TableTile key={r.card.id} card={r.card} onOpen={onTable && (() => onTable(r.card.id))} />
                      : <Tile key={r.card.id} card={r.card} tone={r.tone} busy={liking === r.card.id} onOpen={() => openCard(r.card.id)} onLike={() => void likeFromTile(r.card)} />
                  ))}
                </ul>
              ))}
            </div>
            {skeleton && <Ghosts />}
            {next && state === "ready" && <button type="button" className="k-btn" onClick={() => void load(next)} data-testid="more">{say("app.feed.more_cards")}</button>}
            </>}
          </section>
          {gone?.why === "hidden" && undoing && <FeedHidden text={say("app.feed.hidden_gone")} undoText={say("app.feed.hidden_undo")} onUndo={bringBack} ms={`${UNDO_HIDE_MS}ms`} />}
          <TabBar active="feed" onSelect={onTab} />
        </div>
        {onCompose && !likesTab && !quiet && (
          <button type="button" className="k-fab" onClick={() => onCompose(radius)} aria-label={say("app.compose.title")} data-testid="write"><NdIcon name="write" /></button>
        )}
      </main>
      {card && (
        <CardScreen
          key={card.id}
          client={client}
          card={card}
          onTab={onTab}
          onTalk={() => onTab?.("chats")}
          onBack={closeCard}
          onLike={like}
          onUnlike={unlike}
          needPhrase={needPhrase}
          onSay={onCompose ? () => onCompose(radius) : undefined}
          onGone={(why, id, handle) => { closeCard(); setOpened(null); setLikeNote(null); setGone({ why, id, handle }); }}
        />
      )}
    </>
  );
}
