// Writing a phrase, the inbox, and a chat.
//
// The chat's head does not carry the safety code: the owner asked for it to be
// opened from the menu (2026-09-22), so a shoulder in a café does not read it
// off the screen. "Compared" lives until the process exits, like everything
// else here — nothing about a conversation is written to disk (§8.13).

import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { Client } from "../core/client.ts";
import type { Say } from "./strings.ts";
import { Form, Head, Menu, plain } from "./parts.ts";
import type { Place } from "./screens.ts";

// 4 · a phrase. The counter shows the number this client documents (146);
// the node's own limit is what actually refuses (§8.3), and reading it from
// the node is still to do — the two comments used to disagree (consistency
// lens, 2026-09-22).
export function Write(
  { say, client, place, limit, onDone, onBack, onError }: {
    say: Say;
    client: Client;
    place: Place;
    limit: number;
    onDone: (text: string) => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("write.title"), lines: [say("write.hint")] }),
    h(Text, { dimColor: true }, say("chat.counter", { used: [...text].length, limit })),
    h(Form, {
      fields: [{ key: "text", label: say("write.title"), value: text }],
      onChange: (_key, value) => setText(value.slice(0, limit)),
      actions: [
        { key: "send", label: say("write.send"), disabled: text.trim() === "" || busy },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        setBusy(true);
        client.say({ text: text.trim(), mode: "alone", lat: place.lat, lon: place.lon, radius: place.radius })
          .then(() => onDone(text.trim()))
          .catch((e: Error) => onError(e.message))
          .finally(() => setBusy(false));
      },
      actionsHint: say("common.rowActions"),
    }),
  );
}

type Row = {
  kind: string;
  id: string;
  match_id?: string;
  name?: string;
  age?: number;
  state?: string;
  chat_expires_at?: number;
};

// 5 · the inbox: matches waiting for consent, and chats already open.
export function Inbox(
  { say, client, onOpen, onBack, onError }: {
    say: Say;
    client: Client;
    onOpen: (chatId: string, matchId: string | undefined, name: string, age: number) => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [at, setAt] = useState(0);
  const load = () =>
    client.inbox()
      .then((list) => setRows(list as Row[]))
      .catch((e: Error) => onError(e.message));
  useEffect(() => void load(), []);
  useInput((_input, key) => {
    const count = rows?.length ?? 0;
    if (count === 0) return;
    if (key.upArrow) setAt((i) => (i - 1 + count) % count);
    if (key.downArrow) setAt((i) => (i + 1) % count);
  });
  const chosen = rows?.[at];
  const time = (seconds?: number) =>
    seconds ? new Date(seconds * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("inbox.title") }),
    rows === null
      ? h(Text, { dimColor: true }, "…")
      : rows.length === 0
      ? h(Text, { dimColor: true }, say("inbox.empty"))
      : h(
        Box,
        { flexDirection: "column" },
        ...rows.map((r, i) =>
          h(
            Text,
            { key: r.id, bold: i === at },
            `${i === at ? "›" : " "} ${plain(r.name ?? "?", 48)}, ${plain(r.age ?? "?", 3)}   `,
            r.kind === "chat"
              ? `${say("inbox.open")} · ${say("inbox.until", { time: time(r.chat_expires_at) })}`
              : say("inbox.match"),
          )
        ),
      ),
    h(Menu, {
      actions: [
        {
          key: "act",
          label: chosen?.kind === "chat" ? say("inbox.enter") : say("inbox.consent"),
          disabled: !chosen,
        },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (!chosen) return;
        if (chosen.kind === "chat") {
          return onOpen(chosen.id, chosen.match_id, chosen.name ?? "", chosen.age ?? 0);
        }
        client.consent(chosen.match_id ?? chosen.id)
          .then((answer) => {
            const chatId = answer.body.chat_id;
            if (chatId) return onOpen(chatId, chosen.match_id ?? chosen.id, chosen.name ?? "", chosen.age ?? 0);
            return load();
          })
          .catch((e: Error) => onError(e.message));
      },
      hint: say("common.rowActions"),
    }),
  );
}

// 6 · a chat. Everything shown here was opened by the core; the screen holds
// the plain text only in memory, and forgets it when the process ends.
export function Chat(
  { say, client, chatId, matchId, name, age, limit, onBack, onError }: {
    say: Say;
    client: Client;
    chatId: string;
    matchId?: string;
    name: string;
    age: number;
    limit: number;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [lines, setLines] = useState<Array<{ mine: boolean; text: string; broken?: boolean }>>([]);
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    let room: { next: () => Promise<{ type: string; data: unknown }>; close: () => void } | null = null;
    let live = true;
    (async () => {
      const conversation = await client.openConversation(chatId, matchId);
      setCode(conversation.safetyCode);
      room = await client.openRoom(chatId);
      while (live) {
        const frame = await room.next(60_000).catch(() => null);
        if (!frame || frame.type !== "message") continue;
        const { id, ciphertext } = frame.data as { id: string; ciphertext: string };
        // A frame that does not open is the node's doing, not the peer's: it
        // must never be drawn as something they said (security lens,
        // 2026-09-22).
        const text = await client.read(chatId, ciphertext, id, matchId)
          .then((line) => ({ text: line, broken: false }))
          .catch((e: Error) => ({ text: e.message, broken: true }));
        setLines((all) => [...all, { mine: false, ...text }]);
      }
    })().catch((e: Error) => onError(e.message));
    return () => {
      live = false;
      room?.close();
    };
  }, [chatId]);

  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("chat.title", { name: plain(name, 48), age: plain(age, 3) }) }),
    h(
      Box,
      { flexDirection: "column" },
      ...lines.map((l, i) =>
        h(
          Text,
          { key: i, dimColor: l.broken === true },
          l.broken === true
            ? `· ${say("chat.broken", { message: plain(l.text, 120) })}`
            : l.mine
            ? `${say("chat.send")}: ${plain(l.text)}`
            : `${plain(name, 48)}: ${plain(l.text)}`,
        )
      ),
    ),
    showCode
      ? h(
        Box,
        { flexDirection: "column", borderStyle: "single", paddingX: 1 },
        h(Text, { bold: true }, say("chat.code")),
        h(Text, null, code ?? "…"),
        h(Text, { dimColor: true }, say("chat.codeHint")),
        h(Menu, {
          active: showCode,
          actions: [{ key: "ok", label: say("chat.codeMatched") }, { key: "close", label: say("common.close") }],
          onPick: (key) => {
            if (key === "ok") setMatched(true);
            setShowCode(false);
          },
        }),
      )
      : null,
    matched ? h(Text, { dimColor: true }, `✓ ${say("chat.matched")}`) : null,
    h(Text, { dimColor: true }, `${say("chat.counter", { used: [...draft].length, limit })} · ${say("chat.noHistory")}`),
    h(Form, {
      active: !showCode,
      fields: [{ key: "draft", label: ">", value: draft }],
      onChange: (_key, value) => setDraft(value.slice(0, limit)),
      actions: [
        { key: "send", label: say("chat.send"), disabled: draft.trim() === "" },
        { key: "code", label: say("chat.codeItem") },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (key === "code") return setShowCode(true);
        const text = draft.trim();
        setDraft("");
        client.sayInChat(chatId, text, matchId)
          .then(() => setLines((all) => [...all, { mine: true, text }]))
          .catch((e: Error) => onError(e.message));
      },
      actionsHint: say("common.rowActions"),
    }),
  );
}
