// The web face's screens, on the sheets in panel/design/sheets: 01 the splash,
// 02 the two steps of registration, 03 the feed (W1); the PIN after a reload,
// when the device remembers an identity (W1c); the composer, a phrase
// full-screen with like / hide / block, and "liked" (W2); 06/07 the inbox, 06
// the match, 08 the conversation (W3); "me" and what opens from it (W4): the
// name and the age, the PIN, a step away, "start again", and the Article 17
// statements, which the first entry into the feed shows while any are unread
// (depth/ink app.ts). The area and the radius live here, so the composer
// sends from the same circle the feed shows.
//
// One way back into an identity: the vault on the disk, which the PIN opens
// through the node (vault.ts) — every reload, the tab that registered too.
// The tab's own record of W3 (keys as bare CryptoKey objects, no PIN) was the
// retired hole of SEC-2 and went with W1d, once the vault kept the wrap pair
// (verifier of W1d, 2026-09-27).

import { lazy, type ReactElement, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import type { Client, Radius, Statement } from "../../depth/core/client.ts";
import type { Sent } from "./api/actions.ts";
import { say } from "./api/me.ts";
import { ChatKeys } from "./chat/keys.ts";
// The brand's views (brands/index.ts): built for one brand, the other is not bundled.
import { ArrivalView, CardView, ChatView, ComposeView, FeedView, MatchView, MeView } from "./brands/index.ts";
import { Inbox, type MatchRow } from "./screens/Inbox.tsx";
import { entryOf, gateOf, isEntry, isTab, pathOf, type Screen, screenOf } from "./router.ts";
import { Likes } from "./screens/Likes.tsx";
import { Offer } from "./screens/Offer.tsx";
import { useAutoTheme } from "./ui/useTheme.ts";
import { Away, ChangePin, EditProfile, type MeRow, StartAgain, StepAway, ThemePicker } from "./screens/Me.tsx";
import { Register } from "./screens/Register.tsx";
import { Reissue } from "./screens/Reissue.tsx";
import { Restore } from "./screens/Restore.tsx";
import { Splash } from "./screens/Splash.tsx";
import { Statements } from "./screens/Statements.tsx";
import { Legal, stillToAccept } from "./screens/Legal.tsx";
import { Unlock } from "./screens/Unlock.tsx";
import { markWizardSeen, Wizard, wizardSeen } from "./screens/Wizard.tsx";
import { Departure } from "./screens/Departure.tsx";
import { Cabinet } from "./adv/Cabinet.tsx";
import { Table } from "./screens/Table.tsx";
import { NewTable } from "./screens/NewTable.tsx";
import { TableList } from "./screens/TableList.tsx";
import { Tables } from "../../depth/core/tables.ts";
import { tableRefusal } from "./api/tables.ts";
import { Blocked } from "./screens/Blocked.tsx";
import { Hidden } from "./screens/Hidden.tsx";
import { dropGrace, forget, hiddenWithGrace, leavingWithGrace, readRecord, type Record_, returningWithGrace, unlockByGrace } from "./vault.ts";
import { watchIdle } from "./idle.ts";
import { watchLifecycle } from "../../depth/web-platform/vault_keep.ts";
import { Locked } from "./screens/Locked.tsx";
import "./chat/chat.css";
import "./screens/feed.css";
import "./ui/inner.css";
import { FALLBACK, nameOf, type Place as PlaceT, storedPlace, storePlace } from "./geo/place.ts";
import { parseQr, STEP_METRES } from "./geo/qr.ts";
import { PlaceQr } from "./screens/PlaceQr.tsx";
import { Confirm } from "./ui/Sheet.tsx";
import { Place } from "./screens/Place.tsx";
import "./adaptive.css";
import { Screen as Frame } from "./ui/Screen.tsx";
import { TabBar } from "./ui/TabBar.tsx";

type Sealed = "ok" | "failed" | "unlocked" | "unlocked-new-wrap";
// `keys` is null while the page is locked (W13-WL): the chat keys are thrown
// away with the lock and made anew from the long key the seal gives back.
type Seated = { client: Client; keys: ChatKeys | null; sealed: Sealed };
// The venue's cabinet (A1) is its own page: at adv.<storefront> in a real
// deployment, under /adv on the stand. Decided once per load, so the face's
// hooks below are never called conditionally.
// The comic kit's page (ui/KitPreview.tsx): the stand's build only, at /kit.
// Loaded by a dynamic import() under the build-time flag, so a real build
// (VITE_STAND unset) drops the page from its bundle (review panel 01.10.2026, item 3).
const KitPreview = import.meta.env.VITE_STAND === "1" ? lazy(() => import("./ui/KitPreview.tsx").then((m) => ({ default: m.KitPreview }))) : null;
const KIT = KitPreview !== null && location.pathname === "/kit";
const CABINET = location.hostname.startsWith("adv.") || /^\/adv(\/|$)/.test(location.pathname);
// A place QR (screen 26): `/location#p=…&s=…`, read once at load and taken out of the address at once —
// the cell stays in no history, tab restore or copied address. Anything off the shape is no QR.
const QR = /^\/location\/?$/.test(location.pathname) ? parseQr(location.hash) : null;
if (/^\/location\/?$/.test(location.pathname)) history.replaceState(null, "", "/");

export function App() {
  if (KIT && KitPreview) return <Suspense fallback={null}><KitPreview /></Suspense>;
  return CABINET ? <Cabinet /> : <Face />;
}

function Face() {
  const [screen, setScreen] = useState<Screen>({ at: "loading" });
  const [seated, setSeated] = useState<Seated | null>(null);
  // The area is placed anywhere, by the person (§8.3; owner 11.10.2026): a city from the offline list or a
  // point pasted from a map (screens/Place.tsx, the wizard's last step), kept on this device. Until then the
  // node reads around FALLBACK, and the feed says no place is chosen rather than pretending Rome (GOALS §0).
  const [at, setAt] = useState<PlaceT>(() => storedPlace() ?? FALLBACK);
  const [placeChosen, setPlaceChosen] = useState(() => storedPlace() !== null);
  const choosePlace = (p: PlaceT) => { setAt(p); setPlaceChosen(true); };
  // An opened place QR waits for the feed and asks; the point moves only on «put» (sosed.place 26-place-qr).
  const [qr, setQr] = useState<(PlaceT & { s: number }) | null>(null);
  useEffect(() => {
    if (!QR) return;
    void nameOf(QR.lat, QR.lon).then((n) => setQr({ lat: QR.lat, lon: QR.lon, name: n.name, cc: n.cc, source: "point", s: QR.s }));
  }, []);
  // "auto" theme turns with the phase at this place (theme.ts).
  useAutoTheme(at.lon);
  const [radius, setRadius] = useState<Radius>(1000);
  // One's own phrase just sent, with the node's verdict; shown on the feed
  // until the person leaves it (W2, after the verifier).
  // `id` is what POST /feed answered — the feed takes the phrase down by it (W11-C).
  const [sent, setSent] = useState<{ state: Exclude<Sent, { state: "refused" }>["state"]; text: string; id?: string } | null>(null);
  const [gone, setGone] = useState<{ why: "hidden" | "blocked"; id: string; handle?: string } | null>(null);
  // The statements, read once per seated client on the first entry into the
  // feed; null until read, so the read happens once (depth/ink app.ts).
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [edits, setEdits] = useState(0);

  // ── The lock (W13-WL; screen 12, docs/depth-client_RU.md 2026-09-17) ──
  // Five minutes without input with an identity on the page: the core is
  // locked (it refuses every signed call but the PIN's proof), the chat keys
  // are dropped, and the face is one line (Locked.tsx). Drawing it instead of
  // the body unmounts the rooms, and unmounting closes their sockets — a
  // locked page holds no socket. Not `registered` alone: a raised or moved-in
  // identity has a session before it has a PIN (client.canLock).
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!seated || locked) return;
    const client = seated.client;
    const watch = watchIdle(() => {
      if (!client.canLock || client.locked) return;
      // The reload grace dies with the lock (grace.ts): a reload now asks the PIN.
      void dropGrace().then(() => client.lock()).then(() => {
        setSeated((was) => (was && was.client === client ? { ...was, keys: null } : was));
        setLocked(true);
      });
    });
    return () => watch.stop();
  }, [seated?.client, locked]); // eslint-disable-line react-hooks/exhaustive-deps
  // Opened by the PIN without a reload: the chat keys sign with the long
  // key the seal gave back (client.held, as at registration); the screen
  // goes on where it was.
  async function reopened(client: Client) {
    const held = client.held;
    if (!held) throw new Error("the client holds no long key after the unlock");
    const longKey = await held.signing();
    setSeated((was) => (was && was.client === client ? { ...was, keys: new ChatKeys(client, longKey) } : was));
    setLocked(false);
  }

  // ── The address (router.ts; owner 12.10.2026, 14.10.2026 "I do not see the routing") ──
  // Two kinds of entry. The gates before an identity (splash "/", /register,
  // /restore, /arrival, /unlock) are pushed by `gate` with `{gate, i}` in the
  // state — the screen is named by the path alone, nothing of the person, and a
  // reload on one opens it. A seated life writes `{xor, seat, i, screen}`.
  // `seat` names this seated life: entries written by an earlier one (before a
  // reload, or another identity on this device) are never trusted for their object.
  // Every step forward pushes, tab switches included: browser Back walks the
  // tabs as they were visited, and ends where the page was entered — it never
  // loops, because nothing pushes on the way back.
  const seat = useRef<string | null>(null);
  // The vault's record as the page found it (null: none, or forgotten since), and
  // the seated path a deep link asked for before sign-in: where the sign-in continues.
  const vaulted = useRef<Record_ | null>(null);
  const wanted = useRef<string | null>(null);
  // A gate's screen for a path, with the record at hand: no identity to unlock means
  // the splash; a record means one does not register over it (only /restore, which unlock offers).
  function gateScreen(path: string): Screen {
    const g = gateOf(path);
    const record = vaulted.current;
    if (g === "restore") return { at: "restore" };
    if (record) return { at: "unlock", record };
    if (g === "register" || g === "arrival") return { at: g };
    return { at: "splash" };
  }
  // A step forward between gates: a new entry, the path the gate names.
  function gate(to: Screen) {
    const was = history.state as { gate?: string; i?: number } | null;
    history.pushState({ gate: to.at, i: was?.gate && typeof was.i === "number" ? was.i + 1 : 1 }, "", pathOf(to));
    setScreen(to);
  }
  // A gate's own "back": the browser's when a gate lies behind, else the first gate in place.
  function gateBack() {
    const was = history.state as { gate?: string; i?: number } | null;
    if (was?.gate && (was.i ?? 0) > 0) history.back();
    else {
      const to: Screen = vaulted.current ? { at: "unlock", record: vaulted.current } : { at: "splash" };
      history.replaceState({ gate: to.at, i: 0 }, "", pathOf(to));
      setScreen(to);
    }
  }
  function write(to: Screen, how: "push" | "replace") {
    if (!seat.current || isEntry(to)) return;
    const was = entryOf(history.state);
    const ours = was !== null && was.seat === seat.current;
    const i = how === "push" ? (ours ? was.i + 1 : 1) : ours ? was.i : 0;
    const entry = { xor: 1, seat: seat.current, i, screen: to };
    if (how === "push") history.pushState(entry, "", pathOf(to));
    else history.replaceState(entry, "", pathOf(to));
  }
  const go = (to: Screen) => {
    // The tab one is on, tapped again: no new entry for the same place.
    if (isTab(to) && to.at === screen.at) return;
    write(to, "push");
    setScreen(to);
  };
  const swap = (to: Screen) => {
    write(to, "replace");
    setScreen(to);
  };
  // In-app "back": the browser's own when the entry behind is ours (popstate
  // below draws it), so both backs agree; otherwise — the first entry of this
  // seat, a reload — the screen the button always meant, in place.
  const back = (fallback: Screen) => {
    const was = entryOf(history.state);
    if (was && was.seat === seat.current && was.i > 0) history.back();
    else swap(fallback);
  };
  // A new seated life: its first screen replaces the entry the page stood on,
  // so nothing behind it is a screen of this identity — the gates were never written.
  function seatAnew(to: Screen) {
    seat.current = Math.random().toString(36).slice(2);
    history.replaceState({ xor: 1, seat: seat.current, i: 0, screen: to }, "", pathOf(to));
    setScreen(to);
  }
  // The identity is gone from the page: the address is the splash's again.
  function unseat() {
    seat.current = null;
    vaulted.current = null;
    wanted.current = null;
    history.replaceState({ gate: "splash", i: 0 }, "", "/");
  }
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      // Before an identity is open: the gate the path names (Back walks the gates).
      if (!seat.current) return setScreen((now) => (now.at === "offer" || now.at === "loading" ? now : gateScreen(location.pathname)));
      const was = entryOf(e.state);
      if (was && was.seat === seat.current) return setScreen(was.screen);
      // Not this life's entry: what its path names alone — an object screen opens its tab.
      const to = screenOf(location.pathname);
      history.replaceState({ xor: 1, seat: seat.current, i: 0, screen: to }, "", pathOf(to));
      setScreen(to);
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  // The document leaving, hidden, frozen, back from the bfcache: the grace's marks
  // (depth/web-platform/vault_keep.ts watchLifecycle, the same for the app shell; grace.ts says why).
  useEffect(() => watchLifecycle({ hiddenWithGrace, leavingWithGrace, returningWithGrace }), []);
  useEffect(() => {
    (async () => {
      // `<storefront>/o/<code>` — the exit screen of an offer's link (W5): for
      // anybody, before any identity; the rest of the page is not entered.
      const offer = /^\/o\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname);
      if (offer) return setScreen({ at: "offer", code: offer[1] });
      const record = await readRecord().catch(() => undefined);
      vaulted.current = record ?? null;
      // The path the page was loaded at: a gate's own opens it (reload on /register);
      // a seated path is kept for after the sign-in and the gate before it is the unlock or the splash.
      const path = location.pathname;
      const named = gateOf(path);
      if (!named) wanted.current = path;
      // A reload within 30 s of the last input (owner 14.10.2026; grace.ts): the
      // seals open with what this tab kept, no PIN — the page lands where the
      // address says, or on the feed from a gate's own path.
      const graced = record ? await unlockByGrace(record) : null;
      if (graced) {
        setSeated({ client: graced.client, keys: new ChatKeys(graced.client, graced.longKey), sealed: graced.wrapSame ? "unlocked" : "unlocked-new-wrap" });
        return void land(graced.client, named ? "/" : path);
      }
      const to = gateScreen(path);
      // The address says what is drawn: a seated path stays (it is where to continue), a gate's path follows the gate.
      if (named) history.replaceState({ gate: to.at, i: 0 }, "", pathOf(to));
      setScreen(to);
    })();
  }, []);

  // The client in the page's own scope, for the e2e run to drive the parts of
  // the path that have no screen in W3 (a phrase, a like): the keys are the
  // tab's already, this adds no reach a script on the page would not have.
  // Only in the stand's build (VITE_STAND=1): a real page does not hand the
  // long key to every script in the tab (V3); Vite drops the branch otherwise.
  useEffect(() => {
    if (import.meta.env.VITE_STAND !== "1") return;
    (globalThis as unknown as { xor?: unknown }).xor = seated ? { client: seated.client, keys: seated.keys } : undefined;
  }, [seated]);

  // A seated client: the feed — unless one is away (the profile says until
  // when); the statements gate below runs on the feed.
  // `path`: the address the page was loaded at, which the gates left alone —
  // its screen opens (an object screen's tab, router.ts screenOf).
  async function land(client: Client, path = wanted.current ?? location.pathname) {
    wanted.current = null;
    vaulted.current = null;
    setStatements(null);
    const profile = await client.profile().catch(() => null);
    if (profile?.stepped_away_until && profile.stepped_away_until > Date.now() / 1000) {
      return seatAnew({ at: "away", until: profile.stepped_away_until });
    }
    // `/t/<id>` — a table's own link (W8): the node does not put tables in
    // the feed yet, so a table is entered by its id, after the PIN; the
    // address then says /table, the id stays in the entry's state.
    const table = /^\/t\/([0-9a-f-]{36})\/?$/i.exec(path);
    if (table) return seatAnew({ at: "table", tableId: table[1] });
    seatAnew(screenOf(path));
  }

  async function registered(client: Client, sealed: Sealed) {
    // The long key's signing half for the chat keys — from the held copy the
    // registration left, in memory only; the vault holds the sealed one.
    const held = client.held;
    if (!held) throw new Error("the client holds no long key");
    const longKey = await held.signing();
    setSeated({ client, keys: new ChatKeys(client, longKey), sealed });
    // The first entry after registration shows the wizard once per device (Ц4); it lands on the feed after.
    if (!wizardSeen()) return seatAnew({ at: "wizard", from: "register" });
    await land(client);
  }

  // Opened by the PIN: the long key came out of the vault's seal, and the
  // chat keys sign with it. The tab keeps no record of it — the vault is the
  // record, and the PIN opens it again.
  function unlocked(client: Client, longKey: CryptoKey, wrapSame: boolean) {
    setSeated({ client, keys: new ChatKeys(client, longKey), sealed: wrapSame ? "unlocked" : "unlocked-new-wrap" });
    void land(client);
  }

  useEffect(() => {
    if (screen.at !== "feed" || !seated || statements !== null) return;
    seated.client.statements()
      .then((items) => {
        setStatements(items);
        // In the feed's entry, not a new one: a gate, which Back should not reopen.
        if (items.length > 0) swap({ at: "statements", from: "feed" });
      })
      .catch(() => setStatements([]));
  }, [screen.at, seated, statements]);

  // The legal revisions at start-up (W13-LC; chat spec §8.2 :851-858): once
  // per seated client, on the first entry into the feed, the face's manifest
  // against what this device accepted; anything new opens screen 15. The feed
  // is still read behind it; the node's gate keeps publishing and chats shut.
  const [legalChecked, setLegalChecked] = useState<Client | null>(null);
  useEffect(() => {
    if (screen.at !== "feed" || !seated || legalChecked === seated.client) return;
    const client = seated.client;
    setLegalChecked(client);
    void stillToAccept(client).then((left) => { if (left.length > 0) swap({ at: "legal" }); });
  }, [screen.at, seated, legalChecked]);

  // Leaving the feed drops what it said about the last phrase and the last card.
  const leaveFeed = (to: Screen) => {
    setSent(null);
    setGone(null);
    go(to);
  };
  const toFeed = () => back({ at: "feed" });
  // Matches declined in this page's life, kept to be taken back (W17).
  const [declined, setDeclined] = useState<MatchRow[]>([]);

  // A table from the feed or the tables tab (W10, К6б): a seat first — the node says no to a full
  // table or a closed one, and the feed says why; seated, the table screen.
  const [tableNotice, setTableNotice] = useState<string | null>(null);
  // `from` is where the person stood: leaving the table goes back there (П19).
  async function enterTable(id: string, from: "feed" | "tables") {
    setTableNotice(null);
    const sat = await new Tables(seated!.client).sit(id).catch((e: Error) => ({ status: 0, body: { error: { reason: e.message } } }));
    if (sat.status >= 200 && sat.status < 300) return leaveFeed({ at: "table", tableId: id, from });
    setTableNotice(tableRefusal(sat as never) ?? String(sat.status));
  }
  const me = () => back({ at: "me" });

  // The tab bar at the foot, the kit's TabBar: a nav with a name, each tab named
  // by the word under its icon, aria-current on the open one. From 1024 it is the rail (adaptive.css).
  // The screens inside a tab (a card, a chat, a table, a setting) carry the rail only, from 1024:
  // `data-rail-only` hides the nav below that, so a phone sees no bar there and reserves no room for it.
  const tabOf = (at: Screen["at"], from?: string): "feed" | "tables" | "inbox" | "me" | null => {
    switch (at) {
      case "feed": case "tables": case "inbox": case "me": return at;
      case "composer": case "card": case "likes": case "match": case "place": case "place-qr": return at === "match" ? "inbox" : "feed";
      case "chat": return "inbox";
      case "table": case "new-table": return "tables";
      case "statements": return from === "me" ? "me" : "feed";
      case "edit": case "change-pin": case "theme": case "hidden": case "blocked": case "reissue": case "departure": case "step-away": return "me";
      case "wizard": return from === "me" ? "me" : null;
      default: return null;
    }
  };
  const tabNow = seated ? tabOf(screen.at, "from" in screen ? screen.from : undefined) : null;
  const railOnly = tabNow !== null && screen.at !== tabNow;
  const nav = tabNow && (
    <TabBar
      label={say("web.ui.navMain")}
      data-testid="nav"
      data-rail-only={railOnly ? "" : undefined}
      items={[
        { id: "feed", icon: "feed", label: say("web.nav.feed"), current: tabNow === "feed", onSelect: () => go({ at: "feed" }), testid: "nav-feed" },
        { id: "tables", icon: "table", label: say("web.nav.tables"), current: tabNow === "tables", onSelect: () => leaveFeed({ at: "tables" }), testid: "nav-tables" },
        { id: "inbox", icon: "say", label: say("web.nav.inbox"), current: tabNow === "inbox", onSelect: () => leaveFeed({ at: "inbox" }), testid: "nav-inbox" },
        { id: "me", icon: "me", label: say("me.title"), current: tabNow === "me", onSelect: () => leaveFeed({ at: "me" }), testid: "tab-me" },
      ]}
    />
  );

  // One line and nothing else while locked: no name, no counts, no rooms.
  if (locked && seated) {
    return <Locked client={seated.client} onUnlocked={() => void reopened(seated.client)} />;
  }

  const view = (): ReactElement | null => {
  switch (screen.at) {
    case "loading":
      return <Frame name="loading" title={say("web.splash.tagline")}><p className="ui-hint" data-testid="loading">…</p></Frame>;
    case "splash":
      return <Splash onStart={() => gate({ at: "register" })} onRestore={() => gate({ at: "restore" })} onArrive={() => gate({ at: "arrival" })} />;
    case "arrival":
      // Arrived by a move: sealed under a first PIN, seated as after the PIN.
      return <ArrivalView onDone={(client, longKey) => unlocked(client, longKey, true)} onBack={gateBack} />;
    case "restore":
      // Raised by the paper code: seated as after the PIN — the vault is the
      // record, and the tab keeps none.
      return <Restore onDone={(client, longKey) => unlocked(client, longKey, true)} onBack={gateBack} />;
    case "register":
      return <Register onDone={(client, sealed) => { void registered(client, sealed); }} />;
    case "unlock":
      return <Unlock record={screen.record} onDone={unlocked} onForget={() => { vaulted.current = null; gate({ at: "splash" }); }} onRestore={() => gate({ at: "restore" })} />;
    case "offer":
      // The report on the link is signed: offered only to an identity open in
      // this tab already (WS3); the link does not unlock one for it.
      return <Offer code={screen.code} onHome={() => { history.replaceState(null, "", "/"); setScreen({ at: "loading" }); location.reload(); }} />;
    case "feed":
      return (
        <div className="ui-tabbed">
          <FeedView
            client={seated!.client}
            sealed={seated!.sealed}
            at={placeChosen ? at : { ...at, name: say("web.place.none") }}
            radius={radius}
            onRadius={setRadius}
            onOpen={(card) => leaveFeed({ at: "card", card })}
            onTable={(id) => void enterTable(id, "feed")}
            notice={tableNotice}
            onWrite={() => leaveFeed({ at: "composer" })}
            onLikes={() => leaveFeed({ at: "likes" })}
            onPlace={() => leaveFeed({ at: "place" })}
            sent={sent}
            onTakenDown={() => setSent(null)}
            gone={gone}
            onUnhidden={() => setGone(null)}
          />
          {nav}
          <Confirm
            open={qr !== null}
            data-testid="qr-sheet"
            title={qr ? say("web.qr.ask", { where: `${qr.name} · ${STEP_METRES[qr.s - 1] < 1000 ? say("web.feed.m", { n: STEP_METRES[qr.s - 1] }) : say("web.feed.km", { n: STEP_METRES[qr.s - 1] / 1000 })}` }) : ""}
            consequences={[say("web.qr.what")]}
            confirmLabel={say("web.qr.put")}
            cancelLabel={say("web.qr.later")}
            confirmTestId="qr-put"
            cancelTestId="qr-later"
            onConfirm={() => { if (qr) { const { s: _s, ...p } = qr; storePlace(p); choosePlace(p); } }}
            onClose={() => setQr(null)}
          />
        </div>
      );
    case "tables":
      return (
        <div className="ui-tabbed">
          <TableList
            client={seated!.client}
            at={at}
            radius={radius}
            onTable={(id) => void enterTable(id, "tables")}
            onNewTable={() => leaveFeed({ at: "new-table", from: "tables" })}
            notice={tableNotice}
          />
          {nav}
        </div>
      );
    case "composer":
      return (
        <ComposeView
          client={seated!.client}
          at={at}
          radius={radius}
          onSent={(result, text) => {
            setSent({ state: result.state, text, id: result.id });
            toFeed();
          }}
          onBack={toFeed}
        />
      );
    case "card":
      return (
        <CardView
          client={seated!.client}
          card={screen.card}
          onBack={toFeed}
          onTalk={() => go({ at: "inbox" })}
          onGone={(why, id, handle) => {
            setGone({ why, id, handle });
            toFeed();
          }}
        />
      );
    case "place":
      return <Place current={at} onChosen={(p) => { choosePlace(p); toFeed(); }} onBack={toFeed} onQr={() => setScreen({ at: "place-qr" })} />;
    case "place-qr":
      return <PlaceQr place={at} onBack={() => setScreen({ at: "place" })} />;
    case "likes":
      return <Likes client={seated!.client} onBack={toFeed} />;
    case "inbox":
      return (
        <div className="ui-tabbed">
          <Inbox
            client={seated!.client}
            onOpenMatch={(row) => go({ at: "match", row })}
            onOpenChat={(row) => go({ at: "chat", row })}
            declined={declined}
            onUndone={(row) => setDeclined((d) => d.filter((x) => x.id !== row.id))}
          />
          {nav}
        </div>
      );
    case "match":
      return (
        <MatchView
          client={seated!.client}
          keys={seated!.keys!}
          row={screen.row}
          onAgreed={() => back({ at: "inbox" })}
          onWaiting={() => back({ at: "inbox" })}
          onBack={() => back({ at: "inbox" })}
          onDeclined={(row, on) => setDeclined((d) => (on ? [...d.filter((x) => x.id !== row.id), row] : d.filter((x) => x.id !== row.id)))}
        />
      );
    case "chat":
      return <ChatView client={seated!.client} keys={seated!.keys!} row={screen.row} onBack={() => back({ at: "inbox" })} />;
    case "statements":
      return <Statements items={statements ?? []} onDone={screen.from === "me" ? me : () => swap({ at: "feed" })} />;
    case "me":
      return (
        <div className="ui-tabbed">
          <MeView
            client={seated!.client}
            restrictions={statements?.length ?? 0}
            refresh={edits}
            onBack={() => go({ at: "feed" })}
            onOpen={(row: MeRow, current) => {
              if (row === "statements") return go({ at: "statements", from: "me" });
              if (row === "name" || row === "age") return go({ at: "edit", field: row, current: current ?? "" });
              if (row === "away") return go({ at: "step-away" });
              if (row === "pin") return go({ at: "change-pin" });
              if (row === "move") return go({ at: "departure" });
              if (row === "hidden") return go({ at: "hidden" });
              if (row === "blocked") return go({ at: "blocked" });
              if (row === "reissue") return go({ at: "reissue" });
              if (row === "wizard") return go({ at: "wizard", from: "me" });
              if (row === "theme") return go({ at: "theme" });
              go({ at: "reset" });
            }}
          />
          {nav}
        </div>
      );
    case "edit":
      return <EditProfile client={seated!.client} field={screen.field} current={screen.current} onDone={() => { setEdits((n) => n + 1); me(); }} onBack={me} />;
    case "wizard":
      // After registration the address is /me/wizard: land where a deep link asked, else the feed, never back on the wizard.
      return <Wizard onPlace={choosePlace} onDone={() => { markWizardSeen(); if (screen.from === "me") me(); else void land(seated!.client, wanted.current ?? "/"); }} />;
    case "legal":
      return <Legal client={seated!.client} onDone={() => swap({ at: "feed" })} />;
    case "theme":
      return <ThemePicker onBack={me} />;
    case "change-pin":
      return <ChangePin client={seated!.client} onBack={me} />;
    case "new-table":
      return <NewTable client={seated!.client} at={at} radius={radius} onMade={(id) => swap({ at: "table", tableId: id, from: screen.from })} onBack={() => back({ at: screen.from })} />;
    case "table":
      {
        // Back and leave both return to where the table was opened from; back keeps the seat (TB1).
        const away = () => back({ at: screen.from ?? "feed" });
        return <Table client={seated!.client} tableId={screen.tableId} onLeave={away} onBack={away} />;
      }
    case "hidden":
      return <Hidden client={seated!.client} onBack={() => { setEdits((n) => n + 1); me(); }} />;
    case "blocked":
      return <Blocked client={seated!.client} onBack={() => { setEdits((n) => n + 1); me(); }} />;
    case "departure":
      // Moved away: the node froze this session with the approval, and the
      // device keeps nothing of the identity any more.
      return <Departure client={seated!.client} onBack={me} onGone={() => { void forget().then(() => { unseat(); setSeated(null); setStatements(null); setScreen({ at: "splash" }); }); }} />;
    case "reissue":
      return <Reissue client={seated!.client} onDone={me} onBack={me} />;
    case "reset":
      return (
        <StartAgain
          client={seated!.client}
          onBack={me}
          onClosed={() => {
            // Everything this page knew belonged to the closed identity.
            unseat();
            setSeated(null);
            setStatements(null);
            setScreen({ at: "splash" });
          }}
        />
      );
    case "step-away":
      return <StepAway client={seated!.client} onGone={(until) => swap({ at: "away", until })} onBack={me} />;
    case "away":
      return <Away client={seated!.client} until={screen.until} onBack={() => swap({ at: "feed" })} />;
  }
  };
  const shown = view();
  return railOnly ? <div className="ui-railed">{shown}{nav}</div> : shown;
}
