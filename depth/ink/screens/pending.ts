// The conversation that opened for the first to press "talk" and waits for the
// second (chat spec §8.5, the owner's decision of 2026-09-18, chat_RU.md:2133;
// P9, open.tsv chat.queue.ceiling). Writing is allowed: the lines wait here, on
// the device, without a ✓ — the core's queue (depth/core/pending.ts, B16) holds
// them, the node is told nothing until the second's consent, and past
// chat.pending.max the oldest goes without a word. The screen asks the inbox
// now and then: the match became a chat — the queue goes out with the chat's
// first breath (rooms.ts Chat); the match is gone — the offer left, and the
// queue dies with it.
import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text } from "ink";
import type { Client } from "../../core/client.ts";
import type { Say } from "../strings.ts";
import { Form, Head, Menu, plain } from "../parts.ts";

export function Waiting(
  { say, client, matchId, name, age, limit, onOpened, onBack, onFeed, onError, pollMs = 5000 }: {
    say: Say;
    client: Client;
    matchId: string;
    name: string;
    age: number;
    limit: number;
    // The second agreed: the chat is open, and its screen sends what waited.
    onOpened: (chatId: string, matchId: string, name: string, age: number) => void;
    onBack: () => void;
    // The tombstone's one way out.
    onFeed: () => void;
    onError: (message: string) => void;
    pollMs?: number;
  },
): ReactElement {
  // A copy: the core hands its live array, and a list React holds is not one the core may shift under it.
  const [queued, setQueued] = useState<readonly string[]>(() => [...client.queued(matchId)]);
  const [draft, setDraft] = useState("");
  const [gone, setGone] = useState(false);
  useEffect(() => {
    let live = true;
    const look = () =>
      client.inbox()
        .then((items) => {
          if (!live) return;
          const rows = items as Array<{ kind?: string; id?: string; match_id?: string | null }>;
          const chat = rows.find((r) => r.kind === "chat" && r.match_id === matchId);
          if (chat?.id) {
            live = false;
            return onOpened(chat.id, matchId, name, age);
          }
          // Not offered any more and not a chat: the second said no, or the
          // match ran out — either way the offer left (§8.5), and so does the queue.
          if (!rows.some((r) => r.kind === "match" && r.id === matchId)) {
            live = false;
            client.dropQueued(matchId);
            setQueued([]);
            setDraft("");
            setGone(true);
          }
        })
        .catch((e: Error) => onError(e.message));
    const tick = setInterval(look, pollMs);
    return () => {
      live = false;
      clearInterval(tick);
    };
  }, [matchId, pollMs]);

  if (gone) {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Head, { title: say("chat.title", { name: plain(name, 48), age: plain(age, 3) }) }),
      h(Text, { color: "red" }, say("chat.offerGone")),
      h(Menu, { actions: [{ key: "feed", label: say("chat.toFeed") }], onPick: onFeed, hint: say("common.rowActions") }),
    );
  }
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("chat.title", { name: plain(name, 48), age: plain(age, 3) }), lines: [say("chat.waiting")] }),
    h(Text, { dimColor: true }, say("chat.waitingHint")),
    queued.length > 0
      ? h(Box, { flexDirection: "column" }, ...queued.map((line, i) => h(Text, { key: i }, `  ${plain(line, limit)}  · ${say("chat.queued")}`)))
      : null,
    h(Text, { dimColor: true }, `${say("chat.counter", { used: [...draft].length, limit })} · ${say("chat.noHistory")}`),
    h(Form, {
      fields: [{ key: "draft", label: ">", value: draft }],
      onChange: (_key, value) => setDraft(value.slice(0, limit)),
      actions: [
        { key: "send", label: say("chat.send"), disabled: draft.trim() === "" },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        const text = draft.trim();
        setDraft("");
        // To the device's queue, not to the node: there is no key to seal it
        // with before the second's consent (§8.13).
        client.queueLine(matchId, text);
        setQueued([...client.queued(matchId)]);
      },
      actionsHint: say("common.rowActions"),
    }),
  );
}
