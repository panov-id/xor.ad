// The web face's screens, on the sheets in panel/design/sheets: 01 the splash,
// 02 the two steps of registration, 03 the feed (W1); 06/07 the inbox, 06 the
// match, 08 the conversation (W3). The composer, the likes and the card are W2.
//
// A tab that registered keeps its identity for as long as it lives
// (web/src/chat/tab_session.ts): a reload comes back to the inbox with the
// same session, so a conversation opens again from the wrap the node kept.

import { useEffect, useState } from "react";
import type { Client } from "../../depth/core/client.ts";
import { ChatKeys } from "./chat/keys.ts";
import { keepForTab, restoreForTab } from "./chat/tab_session.ts";
import { Chat } from "./screens/Chat.tsx";
import { Feed } from "./screens/Feed.tsx";
import { Inbox, type InboxChatRow, type MatchRow } from "./screens/Inbox.tsx";
import { Match } from "./screens/Match.tsx";
import { Register } from "./screens/Register.tsx";
import { Splash } from "./screens/Splash.tsx";
import "./chat/chat.css";

type Seated = { client: Client; keys: ChatKeys; sealed: "ok" | "failed" };
type Screen =
  | { at: "loading" }
  | { at: "splash" }
  | { at: "register" }
  | { at: "feed" }
  | { at: "inbox" }
  | { at: "match"; row: MatchRow }
  | { at: "chat"; row: InboxChatRow };

export function App() {
  const [screen, setScreen] = useState<Screen>({ at: "loading" });
  const [seated, setSeated] = useState<Seated | null>(null);

  useEffect(() => {
    restoreForTab()
      .then((back) => {
        if (back) {
          setSeated({ client: back.client, keys: new ChatKeys(back.client, back.longKey), sealed: "ok" });
          setScreen({ at: "inbox" });
        } else {
          setScreen({ at: "splash" });
        }
      })
      .catch(() => setScreen({ at: "splash" }));
  }, []);

  // The client in the page's own scope, for the e2e run to drive the parts of
  // the path that have no screen in W3 (a phrase, a like): the keys are the
  // tab's already, this adds no reach a script on the page would not have.
  useEffect(() => {
    (globalThis as unknown as { xor?: unknown }).xor = seated ? { client: seated.client, keys: seated.keys } : undefined;
  }, [seated]);

  async function registered(client: Client, sealed: "ok" | "failed") {
    const { longKey } = await keepForTab(client);
    setSeated({ client, keys: new ChatKeys(client, longKey), sealed });
    setScreen({ at: "feed" });
  }

  const nav = seated && (screen.at === "feed" || screen.at === "inbox") && (
    <nav className="nav screen" style={{ minHeight: 0, paddingBottom: 0 }} data-testid="nav">
      <button type="button" aria-current={screen.at === "feed" ? "page" : undefined} onClick={() => setScreen({ at: "feed" })} data-testid="nav-feed">лента</button>
      <button type="button" aria-current={screen.at === "inbox" ? "page" : undefined} onClick={() => setScreen({ at: "inbox" })} data-testid="nav-inbox">разговоры</button>
    </nav>
  );

  switch (screen.at) {
    case "loading":
      return <main className="screen"><p className="muted" data-testid="loading">…</p></main>;
    case "splash":
      return <Splash onStart={() => setScreen({ at: "register" })} />;
    case "register":
      return <Register onDone={(client, sealed) => { void registered(client, sealed); }} />;
    case "feed":
      return <>{nav}<Feed client={seated!.client} sealed={seated!.sealed} /></>;
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
