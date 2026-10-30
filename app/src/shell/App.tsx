import { useEffect, useRef, useState } from "react";
import type { Client, Radius } from "@sdk/client.ts";
import { type ChatKeys, chatKeysFor, type InboxChatRow } from "@platform/chat/keys.ts";
import { gateOf, gateScreen, landing, pathOf, type Screen, seatScreen } from "../router";
import { Arrival } from "../screens/Arrival";
import { Chat } from "../screens/Chat";
import { Composer } from "../screens/Composer";
import { TalksPane } from "../screens/talks/TalksPane";
import { EmptyPane } from "./EmptyPane";
import { Intro } from "../screens/Intro";
import { Away } from "../screens/Away";
import { Departure } from "../screens/Departure";
import { Feed } from "../screens/Feed";
import { type SentPhrase, sentOf } from "../screens/feed-logic";
import { Restore } from "../screens/Gate";
import { Update } from "../screens/Update";
import { useNewVersion } from "./update";
import { version as appVersion } from "../../package.json";
import { Loading } from "../screens/Loading";
import { Locked } from "../screens/Locked";
import { Register, type Seated } from "../screens/Register";
import { Splash } from "../screens/Splash";
import { Unlock } from "../screens/Unlock";
import { Me } from "../screens/me/Me";
import { Inbox } from "../screens/talks/Inbox";
import { Likes } from "../screens/talks/Likes";
import { Match } from "../screens/talks/Match";
import type { MatchRow } from "../screens/talks/talks-logic";
import { NewTable } from "../screens/tables/NewTable";
import { Table } from "../screens/tables/Table";
import { Tables } from "../screens/tables/Tables";
import { Offer } from "../screens/Offer";
import { codeOfPath } from "@sdk/offer_exit.ts";
import { parseQr } from "@sdk/place_qr.ts";
import { Place } from "../screens/me/Place";
import { storedPlace } from "../place";
import { nameOf, storePlace } from "@sdk/place.ts";
import { say } from "../i18n";
import { NdIcon } from "./NdIcon";
import { dropGrace, forget, hiddenWithGrace, idleMs, leavingWithGrace, readRecord, type Record_, returningWithGrace, stampGrace, unlockByGrace, watchIdle, watchLifecycle } from "../vault";
import { LayerStack } from "./layers";
import { type Tab, TabsContext } from "./TabBar";
import { useSkeleton } from "./loading";
import { watchTaps } from "./ripple";
import { InPane } from "../screens/me/parts";

// A place QR (web App.tsx QR, sosed.place 26): `/location#p=…&s=…` read once at load and taken out of the address at
// once, so the cell stays in no history, tab restore or copied address; anything off the shape is no QR. Once seated,
// the place screen opens at the QR's point; nothing is kept until «Here».
const QR = /^\/location\/?$/.test(location.pathname) ? parseQr(location.hash) : null;
if (/^\/location\/?$/.test(location.pathname)) history.replaceState(null, "", "/");

// In the dev server ?boot=<ms> makes the boot wait, to look at the loading screen.
async function boot(): Promise<void> {
  const ms = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("boot")) : 0;
  if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
}

// The gates before an identity (web/src/App.tsx): a step forward pushes a history entry named by
// the gate, Back walks them, a reload opens the gate the path names, or the PIN when this device
// keeps an identity — and no PIN at all within the reload grace (depth/core/grace.ts).
// The desktop (1440 and up, tokens/wide.css): the talks' pane stands at the right of the panel of these screens
// (sosed Dusk desktop_1440_Feed, _Phrase, _Tables, _Write; "Me" has none: its sheet is one panel); below it is not mounted and reads nothing.
const PANE_BESIDE = new Set<Screen["at"]>(["feed", "likes", "tables", "composer"]);   // likes: desktop-1440/3-nearby/my-marks
// The breakpoints are the tokens --bp-tablet and --bp-desktop (tokens/wide.css, the same numbers as its @media): read off :root, as Feed reads --fd-cols.
function minWidthOf(token: string): string {
  if (typeof getComputedStyle !== "function") return "";
  return `(min-width: ${getComputedStyle(document.documentElement).getPropertyValue(token).trim()})`;
}
function useWide(token = "--bp-desktop"): boolean {
  const [wide, setWide] = useState(() => typeof matchMedia === "function" && matchMedia(minWidthOf(token)).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const m = matchMedia(minWidthOf(token)), on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function App() {
  useEffect(() => watchTaps(), []);
  const [screen, setScreen] = useState<Screen>({ at: "loading" });
  const [booting, setBooting] = useState(true);
  // One's own phrase just sent (Composer's answer), shown over the feed until taken down; leaving the feed drops it (web App.tsx leaveFeed).
  const [sent, setSent] = useState<SentPhrase | null>(null);
  useEffect(() => { if (screen.at !== "feed" && screen.at !== "composer") setSent(null); }, [screen.at]);
  // The identity the page holds (a registration made it, the PIN or the grace opened it), in memory only: the disk has it sealed.
  const [seated, setSeated] = useState<Seated | null>(null);
  // The chat keys of the seat (depth/web-platform/chat/keys.ts chatKeysFor): made from the long key the seat
  // holds, whichever way it was taken (registration, PIN, grace, a move); gone with the seat.
  const [chatKeys, setChatKeys] = useState<ChatKeys | null>(null);
  useEffect(() => {
    setChatKeys(null);
    if (!seated) return;
    let live = true;
    chatKeysFor(seated.client).then((k) => { if (live) setChatKeys(k); }, (e) => console.error(e));
    return () => { live = false; };
  }, [seated?.client]); // eslint-disable-line react-hooks/exhaustive-deps
  // Five minutes without input: the core is locked and the face is one line (Locked.tsx).
  const [locked, setLocked] = useState(false);
  // The vault's record as the page found it (null: none, or forgotten since): the gates read it.
  const vaulted = useRef<Record_ | null>(null);
  // An identity is on the page (a seat): Back and a typed address move between its screens (the feed, /move).
  const held = useRef(false);
  // the place QR leads once: a later seat (an unlock after a lock) does not open it again
  const qrUsed = useRef(false);
  const [qrAsk, setQrAsk] = useState<{ lat: number; lon: number; s: number } | null>(null);   // place-qr: the question over the feed
  const [feedKey, setFeedKey] = useState(0);
  // Waiting rules (MOTION.md): the loading screen shows only if the wait outlasts 300 ms, and then stays 600 ms.
  const loadingShown = useSkeleton(booting);
  const fresh = useNewVersion(appVersion);   // screen 15: a newer build on the server
  const wide = useWide();
  const toPlace = () => { history.pushState({ gate: "place", i: 1 }, "", pathOf({ at: "place" })); setScreen({ at: "place" }); };
  const feedOf = (seated: { client: Client }) => <Feed key={feedKey} client={seated.client} onTab={tab} onCompose={openComposer} sent={sent} onTakenDown={() => setSent(null)} onLikes={toLikes} onNewTable={() => toNewTable()} onTable={toTable} onPlace={toPlace} />;
  // The tablet and up: the talks' screen opens a talk beside its list (tablet_834_Talks), not over it.
  const twoPane = useWide("--bp-tablet");
  const [beside, setBeside] = useState<InboxChatRow | null>(null);
  // desktop-1440 5-talks/offer.svg: at wide a match opens in the right pane beside the talks, as a talk does
  const [besideMatch, setBesideMatch] = useState<MatchRow | null>(null);

  useEffect(() => {
    void (async () => {
      await boot();
      const record = await readRecord().catch(() => undefined);
      vaulted.current = record ?? null;
      // A reload within 30 s of the last input (owner 14.10.2026; grace.ts): the seals open with what this tab
      // kept, no PIN — the page lands where seat() lands (a place QR opened is the place at its point).
      const graced = record ? await unlockByGrace(record).catch(() => null) : null;
      if (graced) {
        seat({ client: graced.client, sealed: graced.wrapSame ? "unlocked" : "unlocked-new-wrap" });
        return setBooting(false);
      }
      // An offer's link (`/o/<code>`, web App.tsx): its exit screen opens before any unlock; a kept identity stays shut.
      const offered = codeOfPath(location.pathname);
      if (offered) {
        setScreen({ at: "offer", code: offered });
        return setBooting(false);
      }
      const to = gateScreen(location.pathname, vaulted.current);
      if (gateOf(location.pathname)) history.replaceState({ gate: to.at, i: 0 }, "", pathOf(to));
      setScreen(to);
      setBooting(false);
    })();
  }, []);

  useEffect(() => {
    // An entry of the feed (its open card included) is the feed's own to read (screens/Feed.tsx), not a gate to re-pick.
    const onPop = () => {
      // Seated, Back that lands on a gate (splash, register: entries left from before the seat) does not reopen it:
      // the screen stays and takes that entry over (an away keeps its until), so a person in never sees the splash again.
      if (held.current && gateOf(location.pathname)) {
        setScreen((now) => {
          const until = (now as { until?: number }).until;
          history.replaceState({ gate: now.at, i: 0, ...(until === undefined ? {} : { until }) }, "", pathOf(now));
          return now;
        });
        return;
      }
      setScreen((now) => {
      if (now.at === "loading" || (now.at === "feed" && (history.state as { gate?: string } | null)?.gate === "feed")) return now;
      const offered = held.current ? null : codeOfPath(location.pathname);
      if (offered) return { at: "offer", code: offered };
      if (!held.current || gateOf(location.pathname)) return gateScreen(location.pathname, vaulted.current);
      const to = seatScreen(location.pathname, history.state as Parameters<typeof seatScreen>[1]);
      // A seat's address that opens another screen (an /away whose until lapsed): the entry says where the person is.
      if (location.pathname.replace(/\/+$/, "") !== pathOf(to)) history.replaceState({ gate: to.at, i: 0 }, "", pathOf(to));
      return to;
      });
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // The document leaving, hidden, frozen, back from the bfcache: the grace's marks (the same as the web's).
  useEffect(() => watchLifecycle({ hiddenWithGrace, leavingWithGrace, returningWithGrace }), []);

  // The lock (web App.tsx W13-WL): five minutes without input with an identity on the page. The reload grace
  // dies with the lock: a reload now asks the PIN. Not `registered` alone: a raised identity has a session before a PIN.
  useEffect(() => {
    if (!seated || locked) return;
    const client = seated.client;
    const watch = watchIdle(() => {
      if (!client.canLock || client.locked) return;
      void dropGrace().then(() => client.lock()).then(() => setLocked(true));
    }, stampGrace, idleMs());
    return () => watch.stop();
  }, [seated?.client, locked]); // eslint-disable-line react-hooks/exhaustive-deps

  // The stand's build only: the client in the page's own scope for a test to drive (web does the same).
  useEffect(() => {
    if (import.meta.env.VITE_STAND !== "1") return;
    (globalThis as unknown as { xor?: unknown }).xor = seated ? { client: seated.client, openChat } : undefined;
  }, [seated]);

  function gate(to: Screen) {
    const was = history.state as { gate?: string; i?: number } | null;
    history.pushState({ gate: to.at, i: was?.gate && typeof was.i === "number" ? was.i + 1 : 1 }, "", pathOf(to));
    setScreen(to);
  }
  // A gate's own "back": the browser's when a gate lies behind, else the first gate in place.
  function gateBack() {
    const was = history.state as { gate?: string; i?: number } | null;
    if (was?.gate && (was.i ?? 0) > 0) return history.back();
    const to: Screen = vaulted.current ? { at: "unlock", record: vaulted.current } : { at: "splash" };
    history.replaceState({ gate: to.at, i: 0 }, "", pathOf(to));
    setScreen(to);
  }

  // Registered or unlocked: the feed. The gates behind are left: Back does not return to them. A place QR opened, or
  // the first entry with no place on this device (GOALS: a step before the feed, not Rome in silence): the place first.
  function seat(who: Seated, fresh = false) {
    vaulted.current = null;
    held.current = true;
    setSeated(who);
    // place-qr (the owner, 28.10): a QR opened asks over the feed; it no longer opens the place screen
    const qr = qrUsed.current ? null : QR;
    qrUsed.current = qrUsed.current || !!qr;
    const first = landing(null, storedPlace().chosen, fresh);
    const to: Screen = qr && first.at === "place" ? { at: "feed" } : first;
    if (qr) setQrAsk(qr);
    history.replaceState({ gate: to.at, i: 0 }, "", pathOf(to));
    setScreen(to);
    void awayCheck(who.client);
  }
  // Seated while a step away is on (the profile says until when; web App.tsx land): the away screen, not the feed.
  async function awayCheck(client: Client) {
    const until = (await client.profile().catch(() => null))?.stepped_away_until;
    if (typeof until === "number" && until > Date.now() / 1000) {
      history.replaceState({ gate: "away", i: 0, until }, "", pathOf({ at: "away", until }));
      setScreen({ at: "away", until });
    }
  }
  // Back to the feed from a seat's screen, in place (the away screen's end, the departure's back).
  function toFeed() {
    history.replaceState({ gate: "feed", i: 0 }, "", pathOf({ at: "feed" }));
    setScreen({ at: "feed" });
  }
  // Moved away: the node froze this session with the approval; this device forgets the identity and starts over (web App.tsx).
  function gone() {
    held.current = false;
    void forget().then(() => {
      setSeated(null);
      history.replaceState({ gate: "splash", i: 0 }, "", pathOf({ at: "splash" }));
      setScreen({ at: "splash" });
    });
  }
  const unlocked = (client: Client, wrapSame: boolean) => seat({ client, sealed: wrapSame ? "unlocked" : "unlocked-new-wrap" });
  // The tab bar: the feed and "Me" are seats as the feed is (a reload asks the PIN); one replaces the other in history.
  // A chat opens over the screen it came from (the inbox, later; the stand now): its row rides in the entry, and
  // its own back is the history's Back (web App.tsx go/back).
  const openChat = (row: InboxChatRow) => {
    const was = history.state as { i?: number } | null;
    history.pushState({ gate: "chat", i: (typeof was?.i === "number" ? was.i : 0) + 1, row }, "", pathOf({ at: "chat", row }));
    setScreen({ at: "chat", row });
  };
  // The composer over the feed (web App.tsx: composer from the feed's «say it»): its circle rides in the entry; sent
  // or backed out of, the feed again by the history's Back.
  const openComposer = (radius: Radius) => {
    const was = history.state as { i?: number } | null;
    history.pushState({ gate: "composer", i: (typeof was?.i === "number" ? was.i : 0) + 1, radius }, "", pathOf({ at: "composer", radius }));
    setScreen({ at: "composer", radius });
  };
  const chatBack = () => ((history.state as { i?: number } | null)?.i ? history.back() : toFeed());
  const tab = (to: Tab) => {
    // the rail's «say something» (desktop_1440_*): the composer over the screen it is pressed on, with the feed's first circle
    if (to === "say") return openComposer(1000);
    if (to !== "feed" && to !== "tables" && to !== "chats" && to !== "me") return;
    const at = to === "chats" ? "inbox" : to;
    history.replaceState({ gate: at, i: 0 }, "", pathOf({ at }));
    setScreen({ at });
  };
  // The tables' «New table»: the wizard on top of the list, so its first Back (i: 1) is the history's Back onto /tables.
  // A row's «Watch»: the table over the list (i: 1, its id in the entry), so Back is the history's Back onto /tables.
  const toTable = (id: string) => {
    history.pushState({ gate: "table", i: 1, id }, "", pathOf({ at: "table", id }));
    setScreen({ at: "table", id });
  };
  const toNewTable = (game?: string) => {
    history.pushState({ gate: "new-table", i: 1, ...(game ? { game } : {}) }, "", pathOf({ at: "new-table" }));
    setScreen(game ? { at: "new-table", game } : { at: "new-table" });
  };
  // A table made: the list again, in place of the wizard's entry (the table's own screen, w3_table-*, is not in this shell yet).
  const toTables = () => {
    history.replaceState({ gate: "tables", i: 0 }, "", pathOf({ at: "tables" }));
    setScreen({ at: "tables" });
  };
  // Me's move row: the departure on top of Me, so its back (i: 1) is the history's Back onto /me.
  const toMove = () => {
    history.pushState({ gate: "departure", i: 1 }, "", pathOf({ at: "departure" }));
    setScreen({ at: "departure" });
  };
  // The inbox's «Offers» circle: what I am in on, on top of the inbox (as toMove over Me).
  const toMatch = (row: MatchRow) => {
    if (wide) { setBeside(null); setBesideMatch(row); return; }
    history.pushState({ gate: "match", i: 1, row }, "", pathOf({ at: "match", row }));
    setScreen({ at: "match", row });
  };
  const toLikes = () => {
    history.pushState({ gate: "likes", i: 1 }, "", pathOf({ at: "likes" }));
    setScreen({ at: "likes" });
  };
  // The offer's exit, left: a seat goes back to its feed, in place; with no seat the page starts over from "/" (web App.tsx).
  const leaveOffer = () => {
    if (seated) return toFeed();
    history.replaceState(null, "", "/");
    location.reload();
  };
  // The identity closed for good (Me → Start again): nothing of it stays; the splash.
  const closed = () => {
    held.current = false;
    vaulted.current = null;
    setSeated(null);
    history.replaceState({ gate: "splash", i: 0 }, "", pathOf({ at: "splash" }));
    setScreen({ at: "splash" });
  };

  // One line and nothing else while locked: no name, no counts, no rooms.
  if (locked && seated) return <LayerStack base={<Locked client={seated.client} onUnlocked={() => setLocked(false)} />} />;

  const view = () => {
    if (loadingShown) return <Loading />;
    switch (screen.at) {
      case "loading": return null; // the wait is under 300 ms: nothing is drawn
      case "splash": return <Splash onStart={() => gate({ at: "register" })} />;
      case "register": return <Register onDone={(who) => seat(who, true)} onRestore={() => gate({ at: "restore" })} onArrive={() => gate({ at: "arrival" })} onBack={gateBack} />;
      case "unlock": return <Unlock record={screen.record} onDone={unlocked} onForget={() => { vaulted.current = null; gate({ at: "splash" }); }} onRestore={() => gate({ at: "restore" })} />;
      // A clean device raised by the paper code: sealed under a new PIN, seated as after the PIN.
      case "restore": return <Restore onDone={(client) => seat({ client, sealed: "ok" })} onBack={gateBack} onNew={() => gate({ at: "register" })} onArrive={() => gate({ at: "arrival" })} />;
      // Arrived by a move: sealed under a first PIN, seated as after the PIN.
      case "arrival": return <Arrival onDone={(client) => seat({ client, sealed: "ok" })} onBack={gateBack} />;
      case "feed": return seated ? <>{feedOf(seated)}{qrAsk && <QrAsk at={qrAsk} onLater={() => setQrAsk(null)} onPut={(p) => { storePlace(p); setQrAsk(null); setFeedKey((k) => k + 1); }} />}</> : null;
      // desktop 3-nearby composer.svg: at the desktop the composer stands in the pane beside the feed
      case "composer": return seated ? <>{wide && feedOf(seated)}<Composer client={seated.client} radius={screen.radius} onSent={(result, text) => { setSent(sentOf(result, text)); chatBack(); }} onBack={chatBack} onTab={tab} onPlace={toPlace} /></> : null;
      case "tables": return seated ? <Tables client={seated.client} onTab={tab} onNewTable={toNewTable} onTable={toTable} /> : null;
      // Back keeps the seat (web TB1); standing up, or a seat lost, is the list again.
      case "table": return seated ? <Table key={screen.id} client={seated.client} tableId={screen.id} onBack={() => ((history.state as { i?: number } | null)?.i ? history.back() : toTables())} onLeave={toTables} onTable={toTable} /> : null;
      case "new-table": {
        if (!seated) return null;
        const wizard = <NewTable client={seated.client} picked={screen.game} onMade={toTables} onBack={() => ((history.state as { i?: number } | null)?.i ? history.back() : toTables())} />;
        // desktop-1440 new-table-*.svg: the wizard stands in the right pane beside the tables list
        return wide ? <><Tables client={seated.client} onTab={tab} onNewTable={toNewTable} onTable={toTable} /><div className="k-me-pane" data-testid="new-table-pane"><InPane.Provider value={true}>{wizard}</InPane.Provider></div></> : wizard;
      }
      case "chat": return seated && chatKeys ? <Chat key={screen.row.id} client={seated.client} keys={chatKeys} row={screen.row} onBack={chatBack} /> : null;
      case "me": return seated ? <Me client={seated.client} onTab={tab} onClosed={closed} onMove={toMove} onMoved={gone}
        onAway={(until) => { history.replaceState({ gate: "away", i: 0, until }, "", pathOf({ at: "away", until })); setScreen({ at: "away", until }); }} /> : null;
      // The talks (w3): a match and a talk open over the inbox — a talk's row is the chat's when the node gave it whole.
      case "inbox": return seated ? (
        <Inbox client={seated.client} onTab={tab} onLikes={toLikes} onOpenMatch={toMatch} onOpenChat={twoPane ? (row) => { setBesideMatch(null); setBeside(row); } : openChat}
          pickFirst={twoPane && !wide} selectedId={twoPane ? beside?.id : undefined}
          beside={wide && besideMatch && chatKeys ? <Match key={besideMatch.id} client={seated.client} keys={chatKeys} row={besideMatch} frame="pane"
              onAgreed={() => { setBesideMatch(null); tab("chats"); }} onWaiting={setBesideMatch} onBack={() => setBesideMatch(null)} onTalks={() => setBesideMatch(null)} />
            : twoPane && beside && chatKeys ? <Chat key={beside.id} client={seated.client} keys={chatKeys} row={beside} onBack={() => setBeside(null)} frame="pane" />
            : wide && !beside && !besideMatch ? <EmptyPane icon="talks" hint="app.pane.talks_hint" /> : undefined} />
      ) : null;
      // What I am in on, over the inbox (i: 1): its back is the history's Back onto /inbox; a reload on it, the inbox.
      // A match over the inbox (i: 1, its row in the entry); "Let's talk" agreed by both goes to the talks (the talk's own screen is the chat wave's), a lone yes is the wait in place.
      case "match": return seated && chatKeys ? <Match client={seated.client} keys={chatKeys} row={screen.row} onAgreed={() => tab("chats")}
        // my yes into the entry itself: Forward back onto /match finds the wait, not "Let's talk" again
        onWaiting={(row) => history.replaceState({ ...(history.state as object | null), row }, "")} onBack={() => (history.state as { i?: number } | null)?.i ? history.back() : tab("chats")} onTalks={() => tab("chats")} /> : null;
      case "likes": return seated ? <Likes client={seated.client} onBack={() => (history.state as { i?: number } | null)?.i ? history.back() : tab("chats")} /> : null;
      case "departure": return seated ? <Departure client={seated.client} onBack={() => (history.state as { i?: number } | null)?.i ? history.back() : toFeed()} onGone={gone} /> : null;
      case "offer": return <Offer code={screen.code} client={seated?.client} onBack={leaveOffer} />;
      // Back from the first place is a choice too: the feed, which says no place is chosen
      // «How it works» once after a registration; its end and its close lead to the place, as wizard-5 is the place
      case "intro": return seated ? <Intro onDone={() => { history.replaceState({ gate: "place", i: 0 }, "", pathOf({ at: "place" })); setScreen({ at: "place" }); }} onPlaced={toFeed} onQr={() => tab("me")} /> : null;
      case "place": return seated ? <Place start={screen.start} onChosen={toFeed} onBack={toFeed} onQr={() => tab("me")} /> : null;
      case "away": return seated ? <Away client={seated.client} until={screen.until} onBack={toFeed} /> : null;
    }
  };
  // the tables' right pane holds what opens from the list; with nothing open, it says so (desktop-1920 tables.svg)
  const pane = !(wide && seated && !loadingShown && PANE_BESIDE.has(screen.at)) ? null
    : screen.at === "tables" ? <EmptyPane icon="tables" hint="app.pane.tables_hint" />
    : <TalksPane client={seated.client} actions={{ onOpenMatch: toMatch, onOpenChat: openChat, onLikes: toLikes }} />;
  return <TabsContext.Provider value={tab}><LayerStack base={<>{view()}{pane}</>} />{fresh.version && <Update version={fresh.version} onLater={fresh.later} />}</TabsContext.Provider>;
}

// place-qr: the sheet over the feed: the QR's place by its nearest city, «not now» and «put» (web.qr.*)
function QrAsk({ at, onLater, onPut }: { at: { lat: number; lon: number; s: number }; onLater: () => void; onPut: (p: { lat: number; lon: number; name: string; cc: string; source: "point" }) => void }) {
  const [near, setNear] = useState<{ name: string; cc: string } | null>(null);
  useEffect(() => { let live = true; void nameOf(at.lat, at.lon).then((n) => { if (live) setNear(n); }).catch(() => {}); return () => { live = false; }; }, [at]);
  return (
    <div className="k-chm" data-testid="place-qr-ask">
      <button type="button" className="k-chm-dim" aria-label={say("web.qr.later")} onClick={onLater} />
      <section className="layer-sheet k-chm-sheet" role="dialog" aria-modal="true" aria-labelledby="qr-ask-title">
        <h2 className="k-sheet-title" id="qr-ask-title">{say("web.qr.title")}</h2>
        <p className="k-row k-note"><NdIcon name="qr" /><span>{say("web.qr.ask", { where: near?.name ?? "…" })}</span></p>
        <div className="k-row k-actions">
          <button type="button" className="k-cta" data-outline="" onClick={onLater} data-testid="place-qr-later"><NdIcon name="clock" /><span>{say("web.qr.later")}</span></button>
          <button type="button" className="k-cta" disabled={!near} onClick={() => near && onPut({ lat: at.lat, lon: at.lon, ...near, source: "point" })} data-testid="place-qr-yes"><NdIcon name="check" /><span>{say("web.qr.put")}</span></button>
        </div>
      </section>
    </div>
  );
}
