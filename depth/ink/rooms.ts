// Writing a phrase, the inbox, and a chat.
//
// The chat's head does not carry the safety code: the owner asked for it to be
// opened from the menu (2026-09-22), so a shoulder in a café does not read it
// off the screen. "Compared" lives until the process exits, like everything
// else here — nothing about a conversation is written to disk (§8.13).

import { createElement as h, useEffect, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { Client, Liked as LikedCard, Statement } from "../core/client.ts";
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
  span?: number;
};

// 5 · the inbox: matches waiting for consent, and chats already open.
export function Inbox(
  { say, client, onOpen, onBack, onError }: {
    say: Say;
    client: Client;
    onOpen: (chatId: string, matchId: string | undefined, name: string, age: number, span?: number, endsAt?: number) => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [rows, setRows] = useState<Array<Row & { declined?: boolean }> | null>(null);
  const [at, setAt] = useState(0);
  // Declined rows the node no longer lists (GET /inbox drops them), kept here
  // so "declined · undo" stays in their place until the person leaves (§4.6).
  const [declined, setDeclined] = useState<Array<Row & { declined: true }>>([]);
  const load = (keep = declined) =>
    client.inbox()
      .then((list) => {
        const live = list as Row[];
        // In the order the person already sees: a declined row keeps its
        // place, so the cursor stays on it and "undo" is right there.
        setRows((before) => {
          const now = (before ?? []).flatMap((r) => {
            const fresh = live.find((l) => l.id === r.id);
            if (fresh) return [fresh];
            const held = keep.find((d) => d.id === r.id);
            return held ? [held] : [];
          });
          return [...now, ...live.filter((l) => !now.some((r) => r.id === l.id))];
        });
      })
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
            r.declined
              ? say("inbox.declined")
              : r.kind === "chat"
              ? `${say("inbox.open")} · ${say("inbox.until", { time: time(r.chat_expires_at) })}`
              : say("inbox.match"),
          )
        ),
      ),
    h(Menu, {
      actions: chosen?.declined
        ? [{ key: "undo", label: say("inbox.undo") }, { key: "back", label: say("common.back") }]
        : [
          {
            key: "act",
            label: chosen?.kind === "chat" ? say("inbox.enter") : say("inbox.consent"),
            disabled: !chosen,
          },
          // "Not now" (§4.6): recorded at once and invisible to the other side.
          ...(chosen && chosen.kind !== "chat" ? [{ key: "decline", label: say("inbox.notNow") }] : []),
          { key: "back", label: say("common.back") },
        ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (!chosen) return;
        const matchId = chosen.match_id ?? chosen.id;
        if (key === "decline") {
          return void client.decline(matchId)
            .then((answer) => {
              if (answer.status >= 300) throw new Error(`"not now" refused: ${answer.status}`);
              const keep = [...declined, { ...chosen, declined: true as const }];
              setDeclined(keep);
              return load(keep);
            })
            .catch((e: Error) => onError(e.message));
        }
        if (key === "undo") {
          return void client.undoDecline(matchId)
            .then((answer) => {
              if (answer.status >= 300) throw new Error(`undo refused: ${answer.status}`);
              const keep = declined.filter((d) => d.id !== chosen.id);
              setDeclined(keep);
              return load(keep);
            })
            .catch((e: Error) => onError(e.message));
        }
        if (chosen.kind === "chat") {
          return onOpen(chosen.id, chosen.match_id, chosen.name ?? "", chosen.age ?? 0, chosen.span, chosen.chat_expires_at);
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
// One's own span (§5, §8.6): four values, stepped through by the one menu item
// the terminal has instead of the `t` key. 260 is "while we're talking", 4:20.
const SPANS = [10, 30, 60, 260] as const;
type Span = (typeof SPANS)[number];

export function Chat(
  { say, client, chatId, matchId, name, age, limit, span: startSpan, endsAt: startEnds, onBack, onError }: {
    say: Say;
    client: Client;
    chatId: string;
    matchId?: string;
    name: string;
    age: number;
    limit: number;
    // From GET /inbox; a chat opened right from consent has neither, and then
    // it is the column's default hour counted from now (db/031).
    span?: number;
    endsAt?: number;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [lines, setLines] = useState<Array<{ mine: boolean; text: string; broken?: boolean }>>([]);
  const [draft, setDraft] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [matched, setMatched] = useState(false);
  const [changed, setChanged] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [span, setSpan] = useState<Span>((SPANS as readonly number[]).includes(startSpan ?? 0) ? startSpan as Span : 60);
  // When the chat ends for me: my last own message plus my span. The node
  // counts the same way and sends nothing (§5), so the screen keeps the clock.
  const [endsAt, setEndsAt] = useState<number>(() => startEnds ?? Math.floor(Date.now() / 1000) + span * 60);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  const left = Math.max(0, endsAt - now);
  // The silence counter lives in the last quarter of one's own span (§5).
  const counting = left <= (span * 60) / 4;
  const clock = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;

  // Opening the panel asks the node again rather than trusting what this
  // screen already holds. A rekey does not move the code — it is derived from
  // the long keys, and those stay (§8.13) — but a long key that is suddenly
  // someone else's does move it, and then "compared" is a lie. The review
  // panel of 2026-09-22 asked for the mark to drop on a new epoch; the spec
  // says the epoch is the wrong trigger, so it drops on a changed code.
  const openCode = async () => {
    setShowCode(true);
    try {
      const fresh = (await client.openConversation(chatId, matchId)).safetyCode;
      if (code !== null && fresh !== code) {
        setMatched(false);
        setChanged(true);
      }
      setCode(fresh);
    } catch (e) {
      onError((e as Error).message);
    }
  };

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
      Text,
      counting ? { color: "red" } : { dimColor: true },
      say("chat.fades", { span: say(`chat.spanShort${span}`) }) + (counting ? ` · ${clock}` : ""),
    ),
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
        changed ? h(Text, { color: "red" }, say("chat.codeChanged")) : null,
        h(Menu, {
          active: showCode,
          actions: [{ key: "ok", label: say("chat.codeMatched") }, { key: "close", label: say("common.close") }],
          onPick: (key) => {
            if (key === "ok") {
              setMatched(true);
              setChanged(false);
            }
            setShowCode(false);
          },
        }),
      )
      : null,
    matched ? h(Text, { dimColor: true }, `✓ ${say("chat.matched")}`) : null,
    blocking ? h(Text, { color: "red" }, `${say("block.confirm")} ${say("block.what")}`) : null,
    h(Text, { dimColor: true }, `${say("chat.counter", { used: [...draft].length, limit })} · ${say("chat.noHistory")}`),
    h(Form, {
      active: !showCode,
      fields: [{ key: "draft", label: ">", value: draft }],
      onChange: (_key, value) => setDraft(value.slice(0, limit)),
      actions: [
        { key: "send", label: say("chat.send"), disabled: draft.trim() === "" },
        { key: "code", label: say("chat.codeItem") },
        { key: "span", label: say("chat.span", { span: say(`chat.spanLong${span}`) }) },
        { key: "end", label: say("chat.end") },
        { key: "block", label: say("block.item") },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (key === "code") return void openCode();
        if (key === "span") {
          const next = SPANS[(SPANS.indexOf(span) + 1) % SPANS.length];
          return void client.setChatSpan(chatId, next)
            .then(() => {
              // The end moves with the span, from the same last own message.
              setEndsAt((end) => end - span * 60 + next * 60);
              setSpan(next);
            })
            .catch((e: Error) => onError(e.message));
        }
        // Ending is mutual and plain; blocking is mutual and final, so it is
        // the one that asks twice (§4.8, the owner's shape of 2026-09-22).
        if (key === "end") {
          return void client.closeChat(chatId)
            .then(() => onBack())
            .catch((e: Error) => onError(e.message));
        }
        if (key === "block") {
          if (!blocking) return setBlocking(true);
          setBlocking(false);
          return void client.blockByChat(chatId)
            .then(() => onBack())
            .catch((e: Error) => onError(e.message));
        }
        const text = draft.trim();
        setDraft("");
        client.sayInChat(chatId, text, matchId)
          .then(() => {
            setLines((all) => [...all, { mine: true, text }]);
            // My own message is what resets my silence (§5).
            setEndsAt(Math.floor(Date.now() / 1000) + span * 60);
          })
          .catch((e: Error) => onError(e.message));
      },
      actionsHint: say("common.rowActions"),
    }),
  );
}

// 7 · what I hid. Hiding is mine alone and the node forgets it the moment the
// phrase expires, so this list is short by construction (§8.9).
export function Hidden(
  { say, client, onBack, onError }: {
    say: Say;
    client: Client;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [rows, setRows] = useState<Array<{ id: string; text: string }> | null>(null);
  const [at, setAt] = useState(0);
  const load = () =>
    client.hidden()
      .then((list) => setRows(list))
      .catch((e: Error) => onError(e.message));
  useEffect(() => void load(), []);
  useInput((_input, key) => {
    const count = rows?.length ?? 0;
    if (count === 0) return;
    if (key.upArrow) setAt((i) => (i - 1 + count) % count);
    if (key.downArrow) setAt((i) => (i + 1) % count);
  });
  const chosen = rows?.[at];
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("hidden.title") }),
    rows === null
      ? h(Text, { dimColor: true }, "…")
      : rows.length === 0
      ? h(Text, { dimColor: true }, say("hidden.empty"))
      : h(
        Box,
        { flexDirection: "column" },
        ...rows.map((r, i) =>
          h(Text, { key: r.id, bold: i === at }, `${i === at ? "›" : " "} ${plain(r.text, 200)}`)
        ),
      ),
    h(Menu, {
      actions: [
        { key: "back-it", label: say("hidden.restore"), disabled: !chosen },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (!chosen) return;
        client.unhide(chosen.id)
          .then(() => {
            setAt(0);
            return load();
          })
          .catch((e: Error) => onError(e.message));
      },
      hint: say("common.rowActions"),
    }),
  );
}

// The Article 17 statements of reasons (dsa/SPEC §7, the wording of
// refusal-wordings §6; frames U, V, W of panel/design/sheets/screen-06-07-10.svg).
// Not a refusal but the explanation of a restriction on something already
// published — and with no e-mail on file, this screen is the only place it
// reaches the person. It opens by itself when the feed is first reached in a
// run: a run is the "next entry" §7 speaks of, and nothing is kept on disk to
// remember that it was read (§8.13). "Got it" folds it into the red
// "Restrictions: N" row of the feed; it is never erased.
const RESTRICTIONS: readonly string[] = ["removed", "hidden", "offer_taken_down", "access_restricted"];

export function Statements(
  { say, lang, items, onDone }: {
    say: Say;
    lang: string;
    items: Statement[];
    onDone: () => void;
  },
): ReactElement {
  const [at, setAt] = useState(0);
  useInput((_input, key) => {
    if (items.length < 2) return;
    if (key.upArrow) setAt((i) => (i - 1 + items.length) % items.length);
    if (key.downArrow) setAt((i) => (i + 1) % items.length);
  });
  // The node's numbers and names are checked before they are drawn: an unknown
  // restriction would otherwise print itself through say()'s fallback, escape
  // sequences and all, and a date that is not a number throws inside Intl and
  // takes the screen down with it (security lens, 23.09.2026).
  const day = (seconds: unknown) =>
    typeof seconds === "number" && Number.isFinite(seconds)
      ? new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
        .format(new Date(seconds * 1000))
      : "?";
  const s = items[at];
  const kind = RESTRICTIONS.includes(s.restriction) ? say(`statements.${s.restriction}`) : plain(s.restriction, 40);
  const row = (label: string, value: string) =>
    h(Box, { key: label }, h(Box, { width: 16, flexShrink: 0 }, h(Text, { dimColor: true }, label)), h(Text, null, value));
  const what = [
    kind,
    day(s.created_at),
    ...(s.until ? [say("statements.until", { date: day(s.until) })] : []),
  ].join(", ");
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, {
      title: say("statements.count", { n: items.length }),
      lines: items.length > 1 ? [`${at + 1} / ${items.length}`] : undefined,
    }),
    h(
      Box,
      { flexDirection: "column", borderStyle: "single", borderColor: "red", paddingX: 1 },
      row(say("statements.what"), what),
      row(say("statements.why"), plain(s.facts, 600)),
      // Two paths, two lines (§6, 04.09.2026): a notice is decided by a person,
      // the complaint threshold hides on its own — and must say so.
      row(say("statements.how"), say(s.automated_used ? "statements.automated" : "statements.human")),
      row(
        say("statements.ground"),
        `${say(s.ground_kind === "legal" ? "statements.law" : "statements.terms")} ${plain(s.ground_text, 400)}`,
      ),
      row(say("statements.next"), say("statements.appeal")),
    ),
    h(Menu, {
      actions: [{ key: "done", label: say("statements.gotIt") }],
      onPick: () => onDone(),
      hint: say("common.rowActions"),
    }),
  );
}

// What I liked (§4.10, screen 25 of the storefronts). Since 17.09.2026 a like
// takes the card out of the feed, and this is the only place to take it back.
// Taking it back leaves "taken back · undo" in the card's place until the
// person moves on; a card an offer to talk came out of cannot be taken back
// (the node answers `spent`) and leads to the inbox instead.
export function Liked(
  { say, client, onInbox, onBack, onError }: {
    say: Say;
    client: Client;
    onInbox: () => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [rows, setRows] = useState<Array<LikedCard & { undone?: boolean }> | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  useEffect(() => {
    client.likes()
      .then((page) => { setRows(page.items); setNext(page.next); })
      .catch((e: Error) => onError(e.message));
  }, []);
  useInput((_input, key) => {
    const count = rows?.length ?? 0;
    if (count === 0) return;
    if (key.upArrow) setAt((i) => (i - 1 + count) % count);
    if (key.downArrow) setAt((i) => (i + 1) % count);
  });
  const chosen = rows?.[at];
  const mark = (id: string, undone: boolean) =>
    setRows((list) => (list ?? []).map((r) => (r.id === id ? { ...r, undone } : r)));
  const time = (seconds: unknown) =>
    typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toTimeString().slice(0, 5) : "?";
  const line = (r: LikedCard & { undone?: boolean }, i: number) =>
    h(
      Box,
      { key: r.id, flexDirection: "column" },
      h(Text, { bold: i === at, dimColor: r.undone }, `${i === at ? "›" : " "} ${r.state === "matched" ? "(*)" : "+"} ${plain(r.text, 200)}`),
      h(
        Text,
        { dimColor: true },
        r.undone
          ? `    ${say("liked.undone")}`
          : r.state === "matched"
          ? `    ${say("liked.offer")}`
          : `    + ${Number(r.like_count) || 0}   ${say("liked.at", { time: time(r.liked_at) })}`,
      ),
    );
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("liked.title") }),
    rows === null
      ? h(Text, { dimColor: true }, "…")
      : rows.length === 0
      ? h(Text, { dimColor: true }, say("liked.empty"))
      : h(Box, { flexDirection: "column", gap: 1 }, ...rows.map(line)),
    h(Menu, {
      actions: [
        chosen?.state === "matched"
          ? { key: "offer", label: say("liked.toOffer") }
          : chosen?.undone
          ? { key: "undo", label: say("liked.undo") }
          // An offer's like is spent at once (§4.4): the node answers `spent`
          // to any take-back, and its one-sided match is not built yet, so
          // there is nowhere to lead either — the action stays, greyed
          // (review panel 23.09.2026).
          : { key: "unlike", label: say("feed.unlike"), disabled: !chosen || chosen.offer !== undefined },
        ...(next ? [{ key: "more", label: say("liked.more") }] : []),
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (key === "more" && next) {
          return void client.likes(next)
            .then((page) => { setRows((list) => [...(list ?? []), ...page.items]); setNext(page.next); })
            .catch((e: Error) => onError(e.message));
        }
        if (!chosen) return;
        if (key === "offer") return onInbox();
        if (key === "unlike") {
          return void client.unlike(chosen.id)
            .then((answer) => {
              // Spent between the list and the press: it became an offer to talk.
              if (answer.body.state === "spent") {
                return setRows((list) => (list ?? []).map((r) => (r.id === chosen.id ? { ...r, state: "matched" as const } : r)));
              }
              mark(chosen.id, true);
            })
            .catch((e: Error) => onError(e.message));
        }
        if (key === "undo") {
          return void client.like(chosen.id)
            .then((answer) => {
              if (answer.status !== 200) throw new Error(`the like refused: ${answer.status}`);
              mark(chosen.id, false);
            })
            .catch((e: Error) => onError(e.message));
        }
      },
      hint: say("common.rowActions"),
    }),
  );
}

// My blocks (§4.11, screen 10 of the storefronts): a line per block, "blocked
// since <date> · lift", no names and no phrases. Lifting cannot be set again
// through the same conversation (§4.8), and the node answers 204 whatever the
// handle was, so the list is read again rather than trusted. The feed offers
// this screen only while there is something on it; when the last block is
// lifted the screen goes back by itself, so "Blocked: 0" is never drawn — an
// open question for the storefronts (Q-48), not one for the terminal to answer.
export function Blocked(
  { say, lang, client, onBack, onError }: {
    say: Say;
    lang: string;
    client: Client;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [rows, setRows] = useState<Array<{ id: string; since: number }> | null>(null);
  const [at, setAt] = useState(0);
  const load = () =>
    client.blocks()
      .then((list) => {
        if (list.length === 0) return onBack();
        setRows(list);
        setAt((i) => Math.min(i, list.length - 1));
      })
      .catch((e: Error) => onError(e.message));
  useEffect(() => void load(), []);
  useInput((_input, key) => {
    const count = rows?.length ?? 0;
    if (count < 2) return;
    if (key.upArrow) setAt((i) => (i - 1 + count) % count);
    if (key.downArrow) setAt((i) => (i + 1) % count);
  });
  const day = (seconds: unknown) =>
    typeof seconds === "number" && Number.isFinite(seconds)
      ? new Intl.DateTimeFormat(lang, { day: "numeric", month: "long", year: "numeric" }).format(new Date(seconds * 1000))
      : "?";
  const chosen = rows?.[at];
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("blocked.count", { n: rows?.length ?? 0 }) }),
    rows === null
      ? h(Text, { dimColor: true }, "…")
      : h(
        Box,
        { flexDirection: "column" },
        ...rows.map((r, i) =>
          h(Text, { key: r.id, bold: i === at }, `${i === at ? "›" : " "} ${say("blocked.since", { date: day(r.since) })}`)
        ),
      ),
    h(Menu, {
      actions: [
        { key: "lift", label: say("blocked.lift"), disabled: !chosen },
        { key: "back", label: say("common.back") },
      ],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (!chosen) return;
        client.unblock(chosen.id)
          .then(() => load())
          .catch((e: Error) => onError(e.message));
      },
      hint: say("common.rowActions"),
    }),
  );
}

// Me (§4.11, screen 10 of the storefronts), the rows that stand on something
// built: the profile as the node keeps it, and the lists that used to crowd the
// feed's row — restrictions on top, in red (refusal-wordings §6), then liked,
// hidden and blocked. Editing the profile, languages, appearance, defaults,
// hints, support and the console are not here yet: their terminal mechanics or
// their refusal texts do not exist (§4.11, §9). No `m` key: the terminal moves
// by arrows and enter only (owner, 2026-09-22), so "me" is an item of the feed.
export type MeRow = "statements" | "liked" | "hidden" | "blocked";
export function Me(
  { say, client, restrictions, onOpen, onBack, onError }: {
    say: Say;
    client: Client;
    restrictions: number;
    onOpen: (row: MeRow) => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [profile, setProfile] = useState<{ name: string; age: number } | null>(null);
  const [hidden, setHidden] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(0);
  const [at, setAt] = useState(0);
  useEffect(() => {
    client.profile().then((p) => setProfile({ name: p.name, age: p.age })).catch((e: Error) => onError(e.message));
    client.hidden().then((list) => setHidden(list.length)).catch(() => {});
    client.blocks().then((list) => setBlocked(list.length)).catch(() => {});
  }, []);
  const rows: Array<{ key: MeRow; label: string; red?: boolean }> = [
    ...(restrictions > 0 ? [{ key: "statements" as const, label: say("statements.count", { n: restrictions }), red: true }] : []),
    { key: "liked", label: say("liked.title") },
    { key: "hidden", label: hidden === null ? say("feed.hidden") : `${say("feed.hidden")} · ${hidden}` },
    // Offered only while there is something to lift: "Blocked: 0" is the
    // storefronts' open question (Q-48), not the terminal's to answer.
    ...(blocked > 0 ? [{ key: "blocked" as const, label: say("blocked.count", { n: blocked }) }] : []),
  ];
  useInput((_input, key) => {
    if (key.upArrow) setAt((i) => (i - 1 + rows.length) % rows.length);
    if (key.downArrow) setAt((i) => (i + 1) % rows.length);
  });
  const chosen = rows[Math.min(at, rows.length - 1)];
  const field = (label: string, value: string) =>
    h(Box, { key: label }, h(Box, { width: 12, flexShrink: 0 }, h(Text, { dimColor: true }, label)), h(Text, null, value));
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("me.title") }),
    h(
      Box,
      { flexDirection: "column" },
      field(say("me.name"), profile ? plain(profile.name, 48) : "…"),
      field(say("me.age"), profile ? plain(profile.age, 3) : "…"),
    ),
    h(
      Box,
      { flexDirection: "column" },
      ...rows.map((row, i) =>
        h(Text, { key: row.key, bold: row.key === chosen?.key, color: row.red ? "red" : undefined }, `${row.key === chosen?.key ? "›" : " "} ${row.label}`)
      ),
    ),
    h(Menu, {
      actions: [{ key: "open", label: say("inbox.enter") }, { key: "back", label: say("common.back") }],
      onPick: (key) => (key === "back" ? onBack() : chosen && onOpen(chosen.key)),
      hint: say("common.rowActions"),
    }),
  );
}
