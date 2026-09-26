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

import { useEffect, useState } from "react";
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
import { Splash } from "./screens/Splash.tsx";
import { Statements } from "./screens/Statements.tsx";
import { Unlock } from "./screens/Unlock.tsx";
import { readRecord, type Record_ } from "./vault.ts";
import "./chat/chat.css";

type Sealed = "ok" | "failed" | "unlocked" | "unlocked-new-wrap";
type Seated = { client: Client; keys: ChatKeys; sealed: Sealed };
type Screen =
  | { at: "loading" }
  | { at: "splash" }
  | { at: "register" }
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
  | { at: "reset" }
  | { at: "step-away" }
  | { at: "away"; until: number };

export function App() {
  const [screen, setScreen] = useState<Screen>({ at: "loading" });
  const [seated, setSeated] = useState<Seated | null>(null);
  // The area is placed anywhere, by the person (§8.3); until the place picker
  // of the sheet is drawn it is one fixed point.
  const [at] = useState({ lat: 41.9, lon: 12.5 });
  const [radius, setRadius] = useState<Radius>(1000);
  // One's own phrase just sent, with the node's verdict; shown on the feed
  // until the person leaves it (W2, after the verifier).
  const [sent, setSent] = useState<{ state: Exclude<Sent, { state: "refused" }>["state"]; text: string } | null>(null);
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
  useEffect(() => {
    (globalThis as unknown as { xor?: unknown }).xor = seated ? { client: seated.client, keys: seated.keys } : undefined;
  }, [seated]);

  async function registered(client: Client, sealed: Sealed) {
    // The long key's signing half for the chat keys — from the held copy the
    // registration left, in memory only; the vault holds the sealed one.
    const held = client.held;
    if (!held) throw new Error("the client holds no long key");
  // A seated client: the feed — unless one is away (the profile says until
  // when); the statements gate below runs on the feed.
  async function land(client: Client) {
    setStatements(null);
    const profile = await client.profile().catch(() => null);
    if (profile?.stepped_away_until && profile.stepped_away_until > Date.now() / 1000) {
      return setScreen({ at: "away", until: profile.stepped_away_until });
    }
    setScreen({ at: "feed" });
  }

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
  const me = () => setScreen({ at: "me" });

  const nav = seated && (screen.at === "feed" || screen.at === "inbox" || screen.at === "me") && (
    <nav className="nav screen" style={{ minHeight: 0, paddingBottom: 0 }} data-testid="nav">
      <button type="button" aria-current={screen.at === "feed" ? "page" : undefined} onClick={() => setScreen({ at: "feed" })} data-testid="nav-feed">лента</button>
      <button type="button" aria-current={screen.at === "inbox" ? "page" : undefined} onClick={() => leaveFeed({ at: "inbox" })} data-testid="nav-inbox">разговоры</button>
      <button type="button" aria-current={screen.at === "me" ? "page" : undefined} onClick={() => leaveFeed({ at: "me" })} data-testid="tab-me">{say("me.title")}</button>
    </nav>
  );

  switch (screen.at) {
    case "loading":
      return <main className="screen"><p className="muted" data-testid="loading">…</p></main>;
    case "splash":
      return <Splash onStart={() => setScreen({ at: "register" })} />;
    case "register":
      return <Register onDone={(client, sealed) => { void registered(client, sealed); }} />;
    case "unlock":
      return <Unlock record={screen.record} onDone={unlocked} onForget={() => setScreen({ at: "splash" })} />;
    case "offer":
      return <Offer code={screen.code} onHome={() => { history.replaceState(null, "", "/"); setScreen({ at: "loading" }); location.reload(); }} />;
    case "feed":
      return (
        <>
          {nav}
          <Feed
            client={seated!.client}
            sealed={seated!.sealed}
            at={at}
            radius={radius}
            onRadius={setRadius}
            onOpen={(card) => leaveFeed({ at: "card", card })}
            onWrite={() => leaveFeed({ at: "composer" })}
            onLikes={() => leaveFeed({ at: "likes" })}
            sent={sent}
            gone={gone}
          />
        </>
      );
    case "composer":
      return (
        <Composer
          client={seated!.client}
          at={at}
          radius={radius}
          onSent={(result, text) => {
            setSent({ state: result.state, text });
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
        <>
          {nav}
          <Inbox
            client={seated!.client}
            onOpenMatch={(row) => setScreen({ at: "match", row })}
            onOpenChat={(row) => setScreen({ at: "chat", row })}
          />
        </>
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
        />
      );
    case "chat":
      return <Chat client={seated!.client} keys={seated!.keys} row={screen.row} onBack={() => setScreen({ at: "inbox" })} />;
    case "statements":
      return <Statements items={statements ?? []} onDone={screen.from === "me" ? me : toFeed} />;
    case "me":
      return (
        <>
          {nav}
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
              setScreen({ at: "reset" });
            }}
          />
        </>
      );
    case "edit":
      return <EditProfile client={seated!.client} field={screen.field} current={screen.current} onDone={() => { setEdits((n) => n + 1); me(); }} onBack={me} />;
    case "change-pin":
      return <ChangePin client={seated!.client} onBack={me} />;
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
