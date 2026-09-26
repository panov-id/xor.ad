// The web face's screens, on the sheets in panel/design/sheets: 01 the splash,
// 02 the two steps of registration, 03 the feed (W1); the PIN after a reload,
// when the device remembers an identity (W1c); 06/07 the inbox, 06 the match,
// 08 the conversation (W3). The composer, the likes and the card are W2.
//
// Two ways back into an identity, in this order: the tab's own record
// (web/src/chat/tab_session.ts — a reload of the tab that registered comes
// back to the inbox with the same session and the wrap the node kept), and
// otherwise the vault on the disk, which the PIN opens through the node
// (vault.ts). The tab's record goes when the vault keeps the wrap pair (W1d).

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
  | { at: "inbox" }
  | { at: "match"; row: MatchRow }
  | { at: "chat"; row: InboxChatRow };

export function App() {
  const [screen, setScreen] = useState<Screen>({ at: "loading" });
  const [seated, setSeated] = useState<Seated | null>(null);

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
    case "unlock":
      return <Unlock record={screen.record} onDone={unlocked} onForget={() => setScreen({ at: "splash" })} />;
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
