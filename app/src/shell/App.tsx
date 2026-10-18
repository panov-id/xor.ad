import { useEffect, useRef, useState } from "react";
import type { Client } from "@sdk/client.ts";
import { type ChatKeys, chatKeysFor, type InboxChatRow } from "@platform/chat/keys.ts";
import { gateOf, gateScreen, pathOf, type Screen, seatScreen } from "../router";
import { Arrival } from "../screens/Arrival";
import { Chat } from "../screens/Chat";
import { Away } from "../screens/Away";
import { Departure } from "../screens/Departure";
import { Feed } from "../screens/Feed";
import { Gate } from "../screens/Gate";
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
import { dropGrace, forget, hiddenWithGrace, idleMs, leavingWithGrace, readRecord, type Record_, returningWithGrace, stampGrace, unlockByGrace, watchIdle, watchLifecycle } from "../vault";
import { LayerStack } from "./layers";
import type { Tab } from "./TabBar";
import { useSkeleton } from "./loading";

// In the dev server ?boot=<ms> makes the boot wait, to look at the loading screen.
async function boot(): Promise<void> {
  const ms = import.meta.env.DEV ? Number(new URLSearchParams(location.search).get("boot")) : 0;
  if (ms > 0) await new Promise<void>((r) => setTimeout(r, ms));
}

// The gates before an identity (web/src/App.tsx): a step forward pushes a history entry named by
// the gate, Back walks them, a reload opens the gate the path names, or the PIN when this device
// keeps an identity — and no PIN at all within the reload grace (depth/core/grace.ts).
export function App() {
  const [screen, setScreen] = useState<Screen>({ at: "loading" });
  const [booting, setBooting] = useState(true);
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
  // Waiting rules (MOTION.md): the loading screen shows only if the wait outlasts 300 ms, and then stays 600 ms.
  const loadingShown = useSkeleton(booting);

  useEffect(() => {
    void (async () => {
      await boot();
      const record = await readRecord().catch(() => undefined);
      vaulted.current = record ?? null;
      // A reload within 30 s of the last input (owner 14.10.2026; grace.ts): the seals open with what this tab
      // kept, no PIN — the page lands on the feed.
      const graced = record ? await unlockByGrace(record).catch(() => null) : null;
      if (graced) {
        vaulted.current = null;
        held.current = true;
        setSeated({ client: graced.client, sealed: graced.wrapSame ? "unlocked" : "unlocked-new-wrap" });
        history.replaceState({ gate: "feed", i: 0 }, "", pathOf({ at: "feed" }));
        setScreen({ at: "feed" });
        void awayCheck(graced.client);
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

  // Registered or unlocked: the feed. The gates behind are left: Back does not return to them.
  function seat(who: Seated) {
    vaulted.current = null;
    held.current = true;
    setSeated(who);
    history.replaceState({ gate: "feed", i: 0 }, "", pathOf({ at: "feed" }));
    setScreen({ at: "feed" });
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
  const chatBack = () => ((history.state as { i?: number } | null)?.i ? history.back() : toFeed());
  const tab = (to: Tab) => {
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
  const toNewTable = () => {
    history.pushState({ gate: "new-table", i: 1 }, "", pathOf({ at: "new-table" }));
    setScreen({ at: "new-table" });
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
      case "splash": return <Splash onStart={() => gate({ at: "register" })} onRestore={() => gate({ at: "restore" })} onArrive={() => gate({ at: "arrival" })} />;
      case "register": return <Register onDone={seat} />;
      case "unlock": return <Unlock record={screen.record} onDone={unlocked} onForget={() => { vaulted.current = null; gate({ at: "splash" }); }} onRestore={() => gate({ at: "restore" })} />;
      case "restore": return <Gate at={screen.at} onBack={gateBack} />;
      // Arrived by a move: sealed under a first PIN, seated as after the PIN.
      case "arrival": return <Arrival onDone={(client) => seat({ client, sealed: "ok" })} onBack={gateBack} />;
      case "feed": return seated ? <Feed client={seated.client} onTab={tab} /> : null;
      case "tables": return seated ? <Tables client={seated.client} onTab={tab} onNewTable={toNewTable} onTable={toTable} /> : null;
      // Back keeps the seat (web TB1); standing up, or a seat lost, is the list again.
      case "table": return seated ? <Table client={seated.client} tableId={screen.id} onBack={() => ((history.state as { i?: number } | null)?.i ? history.back() : toTables())} onLeave={toTables} /> : null;
      case "new-table": return seated ? <NewTable client={seated.client} onMade={toTables} onBack={() => ((history.state as { i?: number } | null)?.i ? history.back() : toTables())} /> : null;
      case "chat": return seated && chatKeys ? <Chat key={screen.row.id} client={seated.client} keys={chatKeys} row={screen.row} onBack={chatBack} /> : null;
      case "me": return seated ? <Me client={seated.client} onTab={tab} onClosed={closed} onMove={toMove} /> : null;
      // The talks (w3): a match and a talk open over the inbox — a talk's row is the chat's when the node gave it whole.
      case "inbox": return seated ? <Inbox client={seated.client} onTab={tab} onLikes={toLikes} onOpenMatch={toMatch} onOpenChat={openChat} /> : null;
      // What I am in on, over the inbox (i: 1): its back is the history's Back onto /inbox; a reload on it, the inbox.
      // A match over the inbox (i: 1, its row in the entry); "Let's talk" agreed by both goes to the talks (the talk's own screen is the chat wave's), a lone yes is the wait in place.
      case "match": return seated && chatKeys ? <Match client={seated.client} keys={chatKeys} row={screen.row} onAgreed={() => tab("chats")}
        // my yes into the entry itself: Forward back onto /match finds the wait, not "Let's talk" again
        onWaiting={(row) => history.replaceState({ ...(history.state as object | null), row }, "")} onBack={() => (history.state as { i?: number } | null)?.i ? history.back() : tab("chats")} onTalks={() => tab("chats")} /> : null;
      case "likes": return seated ? <Likes client={seated.client} onBack={() => (history.state as { i?: number } | null)?.i ? history.back() : tab("chats")} /> : null;
      case "departure": return seated ? <Departure client={seated.client} onBack={() => (history.state as { i?: number } | null)?.i ? history.back() : toFeed()} onGone={gone} /> : null;
      case "offer": return <Offer code={screen.code} client={seated?.client} onBack={leaveOffer} />;
      case "away": return seated ? <Away client={seated.client} until={screen.until} onBack={toFeed} /> : null;
    }
  };
  return <LayerStack base={view()} />;
}
