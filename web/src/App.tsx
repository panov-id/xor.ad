// The web face's screens, on the sheets in panel/design/sheets: 01 the splash,
// 02 the two steps of registration, 03 the feed (W1); the PIN after a reload,
// when the device remembers an identity (W1c); the composer, a phrase
// full-screen with like / hide / block, and "liked" (W2); 06/07 the inbox, 06
// the match, 08 the conversation (W3). The area and the radius live here, so
// the composer sends from the same circle the feed shows.
//
// Two ways back into an identity, in this order: the tab's own record
// (web/src/chat/tab_session.ts — a reload of the tab that registered comes
// back to the inbox with the same session and the wrap the node kept), and
// otherwise the vault on the disk, which the PIN opens through the node
// (vault.ts). The tab's record goes when the vault keeps the wrap pair (W1d).

import { useEffect, useState } from "react";
import type { Client, Radius } from "../../depth/core/client.ts";
import type { Sent } from "./api/actions.ts";
import { ChatKeys } from "./chat/keys.ts";
import { keepForTab, restoreForTab } from "./chat/tab_session.ts";
import { Card } from "./screens/Card.tsx";
import { Chat } from "./screens/Chat.tsx";
import { Composer } from "./screens/Composer.tsx";
import { Feed, type FeedCard } from "./screens/Feed.tsx";
import { Inbox, type InboxChatRow, type MatchRow } from "./screens/Inbox.tsx";
import { Likes } from "./screens/Likes.tsx";
import { Match } from "./screens/Match.tsx";
import { Register } from "./screens/Register.tsx";
import { Splash } from "./screens/Splash.tsx";
import { Unlock } from "./screens/Unlock.tsx";
import { readRecord, type Record_ } from "./vault.ts";
import "./chat/chat.css";

type Sealed = "ok" | "failed" | "unlocked";
type Seated = { client: Client; keys: ChatKeys; sealed: Sealed };
type Screen =
  | { at: "loading" }
  | { at: "splash" }
  | { at: "register" }
  | { at: "unlock"; record: Record_ }
  | { at: "feed" }
  | { at: "composer" }
  | { at: "card"; card: FeedCard }
  | { at: "likes" }
  | { at: "inbox" }
  | { at: "match"; row: MatchRow }
  | { at: "chat"; row: InboxChatRow };

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

  useEffect(() => {
    (async () => {
      const back = await restoreForTab().catch(() => null);
      if (back) {
        setSeated({ client: back.client, keys: new ChatKeys(back.client, back.longKey), sealed: "ok" });
        return setScreen({ at: "inbox" });
      }
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
    const { longKey } = await keepForTab(client);
    setSeated({ client, keys: new ChatKeys(client, longKey), sealed });
    setScreen({ at: "feed" });
  }

  // Opened by the PIN: the long key came out of the vault's seal, and the
  // chat keys sign with it. The tab keeps no record of it — the vault is the
  // record, and the PIN opens it again.
  function unlocked(client: Client, longKey: CryptoKey) {
    setSeated({ client, keys: new ChatKeys(client, longKey), sealed: "unlocked" });
    setScreen({ at: "feed" });
  }

  // Leaving the feed drops what it said about the last phrase and the last card.
  const leaveFeed = (to: Screen) => {
    setSent(null);
    setGone(null);
    setScreen(to);
  };
  const toFeed = () => setScreen({ at: "feed" });

  const nav = seated && (screen.at === "feed" || screen.at === "inbox") && (
    <nav className="nav screen" style={{ minHeight: 0, paddingBottom: 0 }} data-testid="nav">
      <button type="button" aria-current={screen.at === "feed" ? "page" : undefined} onClick={() => setScreen({ at: "feed" })} data-testid="nav-feed">лента</button>
      <button type="button" aria-current={screen.at === "inbox" ? "page" : undefined} onClick={() => leaveFeed({ at: "inbox" })} data-testid="nav-inbox">разговоры</button>
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
  }
}
