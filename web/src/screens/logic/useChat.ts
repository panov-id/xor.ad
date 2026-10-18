// A conversation's state and actions for the web's screen: the session itself is the platform's
// (depth/web-platform/chat/chat_state.ts, shared with the app shell); here it is held for the screen's life,
// with the typed field and the one-second clock of the silence the screen draws.

import { useEffect, useState, useSyncExternalStore } from "react";
import type { Client } from "../../../../depth/core/client.ts";
import type { ChatKeys, InboxChatRow } from "../../../../depth/web-platform/chat/keys.ts";
import { ChatSession } from "../../../../depth/web-platform/chat/chat_state.ts";
import { silence, type Span } from "../../../../depth/web-platform/chat/span.ts";
import { say } from "../../locales/say.ts";

export type { Line, Starter, Status } from "../../../../depth/web-platform/chat/chat_state.ts";

export function useChat({ client, keys, row: given }: { client: Client; keys: ChatKeys; row: InboxChatRow }) {
  const [session] = useState(() => new ChatSession({ client, keys, row: given, say }));
  useEffect(() => {
    session.start();
    return () => session.stop();
  }, [session]);
  const view = useSyncExternalStore((on) => session.subscribe(on), () => session.view());
  const [text, setText] = useState("");

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  const quiet = silence(view.endsAt, view.span, now);
  useEffect(() => {
    if (quiet.left === 0) session.silenceLapsed();
  }, [quiet.left, session]);

  // `line`: a line not typed — a sticker (chat/sticker.ts); the typed text stays in the field then.
  async function send(line?: string) {
    const typed = line === undefined;
    const went = await session.send(typed ? text.trim() : line);
    if (went && typed) setText("");
  }

  return {
    ...view, text, setText, quiet,
    changeSpan: (next: Span) => session.changeSpan(next),
    endChat: () => session.endChat(),
    block: () => session.block(),
    setSafety: (code: string | null) => session.setSafety(code),
    setGameOpen: (open: boolean | ((was: boolean) => boolean)) => session.setGameOpen(typeof open === "function" ? open(session.view().gameOpen) : open),
    send,
    resend: (localId: string) => session.resend(localId),
    rekey: (action: "ask" | "agree") => session.rekey(action),
  };
}

export type ChatLogic = ReturnType<typeof useChat>;
