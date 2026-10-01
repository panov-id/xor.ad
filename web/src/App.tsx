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

import { type ReactNode, useEffect, useState } from "react";
import type { Client, Radius, Statement } from "../../depth/core/client.ts";
import type { Sent } from "./api/actions.ts";
import { say } from "./api/me.ts";
import { ChatKeys } from "./chat/keys.ts";
import { Card } from "./screens/Card.tsx";
import { Chat } from "./screens/Chat.tsx";
import { Composer } from "./screens/Composer.tsx";
import { Feed, type FeedCard } from "./screens/Feed.tsx";
import { Inbox, type InboxChatRow, type MatchRow } from "./screens/Inbox.tsx";
import { Likes } from "./screens/Likes.tsx";
import { Match } from "./screens/Match.tsx";
import { Offer } from "./screens/Offer.tsx";
import { Away, ChangePin, EditProfile, Me, type MeRow, StartAgain, StepAway } from "./screens/Me.tsx";
import { Register } from "./screens/Register.tsx";
import { Reissue } from "./screens/Reissue.tsx";
import { Restore } from "./screens/Restore.tsx";
import { Splash } from "./screens/Splash.tsx";
import { Statements } from "./screens/Statements.tsx";
import { Unlock } from "./screens/Unlock.tsx";
import { Arrival } from "./screens/Arrival.tsx";
import { Departure } from "./screens/Departure.tsx";
import { Cabinet } from "./adv/Cabinet.tsx";
import { Table } from "./screens/Table.tsx";
import { NewTable } from "./screens/NewTable.tsx";
import { Tables } from "../../depth/core/tables.ts";
import { tableRefusal } from "./api/tables.ts";
import { Blocked } from "./screens/Blocked.tsx";
import { Hidden } from "./screens/Hidden.tsx";
import { forget, readRecord, type Record_ } from "./vault.ts";
import "./chat/chat.css";
import "./screens/feed.css";

type Sealed = "ok" | "failed" | "unlocked" | "unlocked-new-wrap";
type Seated = { client: Client; keys: ChatKeys; sealed: Sealed };
type Screen =
  | { at: "loading" }
  | { at: "splash" }
  | { at: "register" }
  | { at: "restore" }
  | { at: "unlock"; record: Record_ }
  | { at: "offer"; code: string }
  | { at: "feed" }
  | { at: "composer" }
  | { at: "card"; card: FeedCard }
  | { at: "likes" }
  | { at: "inbox" }
  | { at: "match"; row: MatchRow }
  | { at: "chat"; row: InboxChatRow }
  | { at: "statements"; from: "feed" | "me" }
  | { at: "me" }
  | { at: "edit"; field: "name" | "age"; current: string }
  | { at: "change-pin" }
  | { at: "reissue" }
  | { at: "departure" }
  | { at: "hidden" }
  | { at: "table"; tableId: string }
  | { at: "new-table" }
  | { at: "blocked" }
  | { at: "arrival" }
  | { at: "reset" }
  | { at: "step-away" }
  | { at: "away"; until: number };

// The venue's cabinet (A1) is its own page: at adv.<storefront> in a real
// deployment, under /adv on the stand. Decided once per load, so the face's
// hooks below are never called conditionally.
const CABINET = location.hostname.startsWith("adv.") || /^\/adv(\/|$)/.test(location.pathname);

export function App() {
  return CABINET ? <Cabinet /> : <Face />;
}

function Face() {
  const [screen, setScreen] = useState<Screen>({ at: "loading" });
  const [seated, setSeated] = useState<Seated | null>(null);
  // The area is placed anywhere, by the person (§8.3); until the place picker
  // of the sheet is drawn it is one fixed point.
  const [at] = useState({ lat: 41.9, lon: 12.5 });
  const [radius, setRadius] = useState<Radius>(1000);
  // One's own phrase just sent, with the node's verdict; shown on the feed
  // until the person leaves it (W2, after the verifier).
  // `id` is what POST /feed answered — the feed takes the phrase down by it (W11-C).
  const [sent, setSent] = useState<{ state: Exclude<Sent, { state: "refused" }>["state"]; text: string; id?: string } | null>(null);
  const [gone, setGone] = useState<{ why: "hidden" | "blocked"; id: string } | null>(null);
  // The statements, read once per seated client on the first entry into the
  // feed; null until read, so the read happens once (depth/ink app.ts).
  const [statements, setStatements] = useState<Statement[] | null>(null);
  const [edits, setEdits] = useState(0);

  useEffect(() => {
    (async () => {
      // `<storefront>/o/<code>` — the exit screen of an offer's link (W5): for
      // anybody, before any identity; the rest of the page is not entered.
      const offer = /^\/o\/([A-Za-z0-9_-]+)\/?$/.exec(location.pathname);
      if (offer) return setScreen({ at: "offer", code: offer[1] });
      const record = await readRecord().catch(() => undefined);
      setScreen(record ? { at: "unlock", record } : { at: "splash" });
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
  async function land(client: Client) {
    setStatements(null);
    const profile = await client.profile().catch(() => null);
    if (profile?.stepped_away_until && profile.stepped_away_until > Date.now() / 1000) {
      return setScreen({ at: "away", until: profile.stepped_away_until });
    }
    // `/t/<id>` — a table's own link (W8): the node does not put tables in
    // the feed yet, so a table is entered by its id, after the PIN.
    const table = /^\/t\/([0-9a-f-]{36})\/?$/i.exec(location.pathname);
    if (table) return setScreen({ at: "table", tableId: table[1] });
    setScreen({ at: "feed" });
  }

  async function registered(client: Client, sealed: Sealed) {
    // The long key's signing half for the chat keys — from the held copy the
    // registration left, in memory only; the vault holds the sealed one.
    const held = client.held;
    if (!held) throw new Error("the client holds no long key");
    const longKey = await held.signing();
    setSeated({ client, keys: new ChatKeys(client, longKey), sealed });
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
        if (items.length > 0) setScreen({ at: "statements", from: "feed" });
      })
      .catch(() => setStatements([]));
  }, [screen.at, seated, statements]);

  // Leaving the feed drops what it said about the last phrase and the last card.
  const leaveFeed = (to: Screen) => {
    setSent(null);
    setGone(null);
    setScreen(to);
  };
  const toFeed = () => setScreen({ at: "feed" });
  // Matches declined in this page's life, kept to be taken back (W17).
  const [declined, setDeclined] = useState<MatchRow[]>([]);

  // A table from the feed (W10): a seat first — the node says no to a full
  // table or a closed one, and the feed says why; seated, the table screen.
  const [tableNotice, setTableNotice] = useState<string | null>(null);
  async function enterTable(id: string) {
    setTableNotice(null);
    const sat = await new Tables(seated!.client).sit(id).catch((e: Error) => ({ status: 0, body: { error: { reason: e.message } } }));
    if (sat.status >= 200 && sat.status < 300) return leaveFeed({ at: "table", tableId: id });
    setTableNotice(tableRefusal(sat as never) ?? String(sat.status));
  }
  const me = () => setScreen({ at: "me" });

  // The tab bar at the foot (sheet 03, kit `tabbar`): three tabs of 125, the
  // kit's line icons, the active one in meta-strong over a 32x3 accent bar.
  const tab = (at: "feed" | "inbox" | "me", icon: ReactNode, label: string, testid: string, go: () => void) => (
    <button type="button" className="tab" aria-current={screen.at === at ? "page" : undefined} onClick={go} data-testid={testid}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">{icon}</svg>
      <span>{label}</span>
    </button>
  );
  const nav = seated && (screen.at === "feed" || screen.at === "inbox" || screen.at === "me") && (
    <nav className="tabbar" data-testid="nav">
      {tab("feed", <path d="M13 15 L31 15 M13 22 L31 22 M13 29 L31 29" />, say("web.nav.feed"), "nav-feed", () => setScreen({ at: "feed" }))}
      {tab("inbox", <path d="M12 14 H32 V27 H20 L15 31 V27 H12 Z" />, say("web.nav.inbox"), "nav-inbox", () => leaveFeed({ at: "inbox" }))}
      {tab("me", <><circle cx="22" cy="17" r="4.5" /><path d="M13 31 C13 25 31 25 31 31" /></>, say("me.title"), "tab-me", () => leaveFeed({ at: "me" }))}
    </nav>
  );

  switch (screen.at) {
    case "loading":
      return <main className="screen"><p className="muted" data-testid="loading">…</p></main>;
    case "splash":
      return <Splash onStart={() => setScreen({ at: "register" })} onRestore={() => setScreen({ at: "restore" })} onArrive={() => setScreen({ at: "arrival" })} />;
    case "arrival":
      // Arrived by a move: sealed under a first PIN, seated as after the PIN.
      return <Arrival onDone={(client, longKey) => unlocked(client, longKey, true)} onBack={() => setScreen({ at: "splash" })} />;
    case "restore":
      // Raised by the paper code: seated as after the PIN — the vault is the
      // record, and the tab keeps none.
      return <Restore onDone={(client, longKey) => unlocked(client, longKey, true)} onBack={() => setScreen({ at: "splash" })} />;
    case "register":
      return <Register onDone={(client, sealed) => { void registered(client, sealed); }} />;
    case "unlock":
      return <Unlock record={screen.record} onDone={unlocked} onForget={() => setScreen({ at: "splash" })} onRestore={() => setScreen({ at: "restore" })} />;
    case "offer":
      // The report on the link is signed: offered only to an identity open in
      // this tab already (WS3); the link does not unlock one for it.
      return <Offer code={screen.code} onHome={() => { history.replaceState(null, "", "/"); setScreen({ at: "loading" }); location.reload(); }} />;
    case "feed":
      return (
        <div className="tabbed">
          <Feed
            client={seated!.client}
            sealed={seated!.sealed}
            at={at}
            radius={radius}
            onRadius={setRadius}
            onOpen={(card) => leaveFeed({ at: "card", card })}
            onTable={(id) => void enterTable(id)}
            onNewTable={() => leaveFeed({ at: "new-table" })}
            notice={tableNotice}
            onWrite={() => leaveFeed({ at: "composer" })}
            onLikes={() => leaveFeed({ at: "likes" })}
            sent={sent}
            onTakenDown={() => setSent(null)}
            gone={gone}
          />
          {nav}
        </div>
      );
    case "composer":
      return (
        <Composer
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
        <Card
          client={seated!.client}
          card={screen.card}
          onBack={toFeed}
          onGone={(why, id) => {
            setGone({ why, id });
            toFeed();
          }}
        />
      );
    case "likes":
      return <Likes client={seated!.client} onBack={toFeed} />;
    case "inbox":
      return (
        <div className="tabbed">
          <Inbox
            client={seated!.client}
            onOpenMatch={(row) => setScreen({ at: "match", row })}
            onOpenChat={(row) => setScreen({ at: "chat", row })}
            declined={declined}
            onUndone={(row) => setDeclined((d) => d.filter((x) => x.id !== row.id))}
          />
          {nav}
        </div>
      );
    case "match":
      return (
        <Match
          client={seated!.client}
          keys={seated!.keys}
          row={screen.row}
          onAgreed={() => setScreen({ at: "inbox" })}
          onWaiting={() => setScreen({ at: "inbox" })}
          onBack={() => setScreen({ at: "inbox" })}
          onDeclined={(row, on) => setDeclined((d) => (on ? [...d.filter((x) => x.id !== row.id), row] : d.filter((x) => x.id !== row.id)))}
        />
      );
    case "chat":
      return <Chat client={seated!.client} keys={seated!.keys} row={screen.row} onBack={() => setScreen({ at: "inbox" })} />;
    case "statements":
      return <Statements items={statements ?? []} onDone={screen.from === "me" ? me : toFeed} />;
    case "me":
      return (
        <div className="tabbed">
          <Me
            client={seated!.client}
            restrictions={statements?.length ?? 0}
            refresh={edits}
            onBack={toFeed}
            onOpen={(row: MeRow, current) => {
              if (row === "statements") return setScreen({ at: "statements", from: "me" });
              if (row === "name" || row === "age") return setScreen({ at: "edit", field: row, current: current ?? "" });
              if (row === "away") return setScreen({ at: "step-away" });
              if (row === "pin") return setScreen({ at: "change-pin" });
              if (row === "move") return setScreen({ at: "departure" });
              if (row === "hidden") return setScreen({ at: "hidden" });
              if (row === "blocked") return setScreen({ at: "blocked" });
              if (row === "reissue") return setScreen({ at: "reissue" });
              setScreen({ at: "reset" });
            }}
          />
          {nav}
        </div>
      );
    case "edit":
      return <EditProfile client={seated!.client} field={screen.field} current={screen.current} onDone={() => { setEdits((n) => n + 1); me(); }} onBack={me} />;
    case "change-pin":
      return <ChangePin client={seated!.client} onBack={me} />;
    case "new-table":
      return <NewTable client={seated!.client} at={at} radius={radius} onMade={(id) => setScreen({ at: "table", tableId: id })} onBack={toFeed} />;
    case "table":
      return <Table client={seated!.client} tableId={screen.tableId} onLeave={() => { history.replaceState(null, "", "/"); setScreen({ at: "feed" }); }} />;
    case "hidden":
      return <Hidden client={seated!.client} onBack={() => { setEdits((n) => n + 1); me(); }} />;
    case "blocked":
      return <Blocked client={seated!.client} onBack={() => { setEdits((n) => n + 1); me(); }} />;
    case "departure":
      // Moved away: the node froze this session with the approval, and the
      // device keeps nothing of the identity any more.
      return <Departure client={seated!.client} onBack={me} onGone={() => { void forget().then(() => { setSeated(null); setStatements(null); setScreen({ at: "splash" }); }); }} />;
    case "reissue":
      return <Reissue client={seated!.client} onDone={me} onBack={me} />;
    case "reset":
      return (
        <StartAgain
          client={seated!.client}
          onBack={me}
          onClosed={() => {
            // Everything this page knew belonged to the closed identity.
            setSeated(null);
            setStatements(null);
            setScreen({ at: "splash" });
          }}
        />
      );
    case "step-away":
      return <StepAway client={seated!.client} onGone={(until) => setScreen({ at: "away", until })} onBack={me} />;
    case "away":
      return <Away client={seated!.client} until={screen.until} onBack={toFeed} />;
  }
}
