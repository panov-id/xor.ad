// Writing a phrase, the inbox, and a chat.
//
// The chat's head does not carry the safety code: the owner asked for it to be
// opened from the menu (2026-09-22), so a shoulder in a café does not read it
// off the screen. "Compared" lives until the process exits, like everything
// else here — nothing about a conversation is written to disk (§8.13).

import { createElement as h, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { Client, Liked as LikedCard, Statement } from "../core/client.ts";
import { CursorRefused } from "../core/client.ts";
import type { Say } from "./strings.ts";
import { Form, Head, Menu, plain } from "./parts.ts";
import { afterClose, reconnectDelay } from "../core/reconnect.ts";
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
  // What the node answered when it did not take the phrase (refusal-wordings
  // §3–§5). The text stays in the field: a refusal of a moment is not a reason
  // to make anyone type it again.
  const [refused, setRefused] = useState<string | null>(null);
  const hhmm = (seconds: unknown) =>
    typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toTimeString().slice(0, 5) : "?";
  const refusal = async (answer: { status: number; body: unknown }): Promise<string | null> => {
    const error = (answer.body as { error?: { code?: string; until?: number; next_slot?: number; checking?: unknown; live?: unknown } })?.error;
    if (answer.status === 429 && error?.until !== undefined) return say("write.paused", { time: hhmm(error.until) });
    if (answer.status === 429 && error?.next_slot !== undefined) return say("write.hourly", { time: hhmm(error.next_slot) });
    if (answer.status === 429) return say("write.rapid");
    if (answer.status === 409 && error?.checking !== undefined) return say("write.hold");
    if (answer.status === 409 && error?.live !== undefined) {
      // The node does not say when a slot frees; one's own phrases do.
      const ends = ((await client.profile().catch(() => null))?.phrases ?? [])
        .map((p) => p.expires_at)
        .filter((n): n is number => typeof n === "number");
      return say("write.live", { time: ends.length ? hhmm(Math.min(...ends)) : "?" });
    }
    return null;
  };
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("write.title"), lines: [say("write.hint")] }),
    h(Text, { dimColor: true }, say("chat.counter", { used: [...text].length, limit })),
    refused ? h(Text, { color: "red" }, refused) : null,
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
        setRefused(null);
        client.say({ text: text.trim(), mode: "alone", lat: place.lat, lon: place.lon, radius: place.radius })
          .then(async (answer) => {
            // Until 23.09.2026 any answer counted as sent, and a refusal showed
            // as "being checked" — the terminal telling a lie on the node's behalf.
            if (answer.status === 200 || answer.status === 202) return onDone(text.trim());
            const why = await refusal(answer);
            if (why) return setRefused(why);
            onError(`the phrase was refused: ${answer.status}`);
          })
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
  my_span?: number;
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
          return onOpen(chosen.id, chosen.match_id, chosen.name ?? "", chosen.age ?? 0, chosen.my_span, chosen.chat_expires_at);
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
  { say, client, chatId, matchId, name, age, limit, span: startSpan, endsAt: startEnds, onBack, onFeed, onError }: {
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
    // The tombstone's one way out (refusal-wordings: "Back to the feed").
    onFeed?: () => void;
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
  const [peerAway, setPeerAway] = useState(false);
  const [span, setSpan] = useState<Span>((SPANS as readonly number[]).includes(startSpan ?? 0) ? startSpan as Span : 60);
  // When the chat ends for me: my last own message plus my span. The node
  // counts the same way and sends nothing (§5), so the screen keeps the clock.
  // Checked like any number from the node: a string would make the clock NaN
  // and hide the end, a 0 would paint it red at once (security lens, 23.09.2026).
  const [endsAt, setEndsAt] = useState<number>(() =>
    typeof startEnds === "number" && Number.isFinite(startEnds) && startEnds > 0
      ? startEnds
      : Math.floor(Date.now() / 1000) + span * 60
  );
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const endsAtRef = useRef(endsAt);
  endsAtRef.current = endsAt;
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  const left = Math.max(0, endsAt - now);
  // The tombstone (chat §5, protocol §4.4): the node closes the room with 4003
  // when the conversation is over — closed by hand, by a block, or by a term —
  // and one's own clock reaching zero is the same end seen from here. What
  // was on the screen goes at once; the words say which end it was.
  const [over, setOver] = useState<"expired" | "ended" | null>(null);
  const end = (why: "expired" | "ended") => {
    setOver((was) => was ?? why);
    setLines([]);
    setDraft("");
    client.forget(chatId);
  };
  useEffect(() => {
    if (left === 0 && over === null) end("expired");
  }, [left]);
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
      // A room is opened again after a close that is not the end (protocol
      // §4.4, core/reconnect.ts): the node's restart closes it with 1001. The
      // node hands what waits on every opening, and depth does not confirm
      // receipt, so lines already on the screen come again — shown once.
      const shown = new Set<string>();
      let attempt = 0;
      while (live) {
        // A node still coming back refuses the ticket: wait and ask again,
        // rather than ending the screen on an error.
        const opened = await client.openRoom(chatId).catch(() => null);
        if (!live) return;
        if (!opened) {
          await new Promise((r) => setTimeout(r, reconnectDelay(attempt++)));
          continue;
        }
        room = opened;
        const closed = (room as unknown as { closed: Promise<number> }).closed ?? new Promise<number>(() => {});
        let code: number | null = null;
        void closed.then((c) => (code = c));
        while (live && code === null) {
          const frame = await Promise.race([room.next(60_000).catch(() => null), closed.then(() => null)]);
          if (!frame) continue;
          attempt = 0;
          // The other side stepped away (§8.2): a mark over the input, which stays
          // live; their first line here takes it off.
          if (frame.type === "sys" && (frame.data as { kind?: string })?.kind === "peer_stepped_away") {
            setPeerAway(true);
            continue;
          }
          if (frame.type !== "message") continue;
          setPeerAway(false);
          const { id, ciphertext } = frame.data as { id: string; ciphertext: string };
          if (shown.has(id)) continue;
          shown.add(id);
          // A frame that does not open is the node's doing, not the peer's: it
          // must never be drawn as something they said (security lens,
          // 2026-09-22).
          const text = await client.read(chatId, ciphertext, id, matchId)
            .then((line) => ({ text: line, broken: false }))
            .catch((e: Error) => ({ text: e.message, broken: true }));
          setLines((all) => [...all, { mine: false, ...text }]);
        }
        if (!live) return;
        const closedWith = await closed;
        const action = afterClose(closedWith);
        // 4003 is the only close that means "over"; its reason is not sent, so
        // one's own clock tells a term from a hand (protocol §4.4).
        if (action === "over") {
          live = false;
          end(Math.floor(Date.now() / 1000) >= endsAtRef.current ? "expired" : "ended");
          return;
        }
        if (action === "stay") return;
        await new Promise((r) => setTimeout(r, reconnectDelay(attempt++)));
      }
    })().catch((e: Error) => onError(e.message));
    return () => {
      live = false;
      room?.close();
    };
  }, [chatId]);

  if (over) {
    return h(
      Box,
      { flexDirection: "column", gap: 1 },
      h(Head, { title: say("chat.title", { name: plain(name, 48), age: plain(age, 3) }) }),
      h(Text, { color: "red" }, say(over === "expired" ? "chat.expired" : "chat.ended")),
      h(Menu, {
        actions: [{ key: "feed", label: say("chat.toFeed") }],
        onPick: () => (onFeed ?? onBack)(),
        hint: say("common.rowActions"),
      }),
    );
  }
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
    peerAway ? h(Text, { color: "yellow" }, say("chat.peerAway")) : null,
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
            .then((kept) => {
              // What the node kept, not what was asked; and the end moves with
              // it, from the same last own message.
              const now = (SPANS as readonly number[]).includes(kept) ? kept as Span : next;
              setEndsAt((end) => end - span * 60 + now * 60);
              setSpan(now);
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
            .catch((e: Error) => {
              // A cursor the node will not open any more starts the list again.
              if (!(e instanceof CursorRefused)) return onError(e.message);
              return client.likes().then((page) => { setRows(page.items); setNext(page.next); })
                .catch((again: Error) => onError(again.message));
            });
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
export type MeRow = "statements" | "liked" | "hidden" | "blocked" | "away" | "name" | "age";
export function Me(
  { say, client, restrictions, onOpen, onBack, onError }: {
    say: Say;
    client: Client;
    restrictions: number;
    onOpen: (row: MeRow, current?: string) => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [profile, setProfile] = useState<{ name: string; pending?: string; age: number } | null>(null);
  const [hidden, setHidden] = useState<number | null>(null);
  const [blocked, setBlocked] = useState(0);
  const [at, setAt] = useState(0);
  useEffect(() => {
    client.profile().then((p) => setProfile({ name: p.name, pending: p.name_pending, age: p.age })).catch((e: Error) => onError(e.message));
    client.hidden().then((list) => setHidden(list.length)).catch(() => {});
    client.blocks().then((list) => setBlocked(list.length)).catch(() => {});
  }, []);
  // The name and the age are rows too since 23.09.2026: enter edits them.
  const nameShown = profile
    ? plain(profile.name, 48) + (profile.pending ? ` → ${plain(profile.pending, 48)} · ${say("feed.checking")}` : "")
    : "…";
  const rows: Array<{ key: MeRow; label: string; red?: boolean }> = [
    ...(restrictions > 0 ? [{ key: "statements" as const, label: say("statements.count", { n: restrictions }), red: true }] : []),
    { key: "name", label: `${say("me.name")}  ${nameShown}` },
    { key: "age", label: `${say("me.age")}  ${profile ? plain(profile.age, 3) : "…"}` },
    { key: "liked", label: say("liked.title") },
    { key: "hidden", label: hidden === null ? say("feed.hidden") : `${say("feed.hidden")} · ${hidden}` },
    // Offered only while there is something to lift: "Blocked: 0" is the
    // storefronts' open question (Q-48), not the terminal's to answer.
    ...(blocked > 0 ? [{ key: "blocked" as const, label: say("blocked.count", { n: blocked }) }] : []),
    { key: "away", label: say("away.item") },
  ];
  useInput((_input, key) => {
    if (key.upArrow) setAt((i) => (i - 1 + rows.length) % rows.length);
    if (key.downArrow) setAt((i) => (i + 1) % rows.length);
  });
  const chosen = rows[Math.min(at, rows.length - 1)];
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("me.title") }),
    h(
      Box,
      { flexDirection: "column" },
      ...rows.map((row, i) =>
        h(Text, { key: row.key, bold: row.key === chosen?.key, color: row.red ? "red" : undefined }, `${row.key === chosen?.key ? "›" : " "} ${row.label}`)
      ),
    ),
    h(Menu, {
      actions: [{ key: "open", label: say("inbox.enter") }, { key: "back", label: say("common.back") }],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (!chosen) return;
        // The name and the age open with what is there now: the pending name if
        // one waits, since that is the one being changed.
        if (chosen.key === "name") return profile && onOpen("name", profile.pending ?? profile.name);
        if (chosen.key === "age") return profile && onOpen("age", String(profile.age));
        onOpen(chosen.key);
      },
      hint: say("common.rowActions"),
    }),
  );
}

// Stepping away (chat §8.2; screen 20 of the storefronts, sosed.place
// docs/20-step-away). Nothing is preselected: the price appears once a span is
// chosen, and "step away" stays dead until then, so a double press does not
// send anyone away for an hour. The price is numbers after labels — the
// terminal's voice, decided by the owner on 23.09.2026 — counted on the spot:
// one's live phrases (GET /identities/me), the likes one gave (GET /likes), and
// the conversations whose own end comes before the break does (GET /inbox).
export const AWAY_MINUTES = { short: 20, hour: 60, long: 240 } as const;
type AwaySpan = keyof typeof AWAY_MINUTES;
const AWAY_ORDER: AwaySpan[] = ["short", "hour", "long"];

export function StepAway(
  { say, client, onGone, onBack, onError }: {
    say: Say;
    client: Client;
    onGone: (until: number) => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [chosen, setChosen] = useState<number>(-1);
  const [going, setGoing] = useState(false);
  const [counts, setCounts] = useState<{ phrases: number; likes: number; ends: number[] } | null>(null);
  useEffect(() => {
    (async () => {
      const profile = await client.profile();
      let likes = 0;
      let after: string | undefined;
      for (let page = 0; page < 20; page++) {
        const got = await client.likes(after).catch((e: Error) => {
          // A refused cursor: count again from the first page; the twenty
          // pages of this loop bound how often that can happen.
          if (!(e instanceof CursorRefused)) throw e;
          likes = 0;
          after = undefined;
          return client.likes();
        });
        likes += got.items.length;
        if (!got.next) break;
        after = got.next;
      }
      const inbox = await client.inbox();
      const ends = inbox
        .filter((r) => r.kind === "chat" && r.state !== "ended")
        .map((r) => Number(r.chat_expires_at))
        .filter((n) => Number.isFinite(n));
      setCounts({ phrases: profile.phrases?.length ?? 0, likes, ends });
    })().catch((e: Error) => onError(e.message));
  }, []);
  useInput((_input, key) => {
    if (key.upArrow) setChosen((i) => (i <= 0 ? AWAY_ORDER.length - 1 : i - 1));
    if (key.downArrow) setChosen((i) => (i + 1) % AWAY_ORDER.length);
  });
  const span = chosen >= 0 ? AWAY_ORDER[chosen] : null;
  const price = () => {
    if (!span || !counts) return say("away.pick");
    const back = Math.floor(Date.now() / 1000) + AWAY_MINUTES[span] * 60;
    return say("away.price", {
      phrases: counts.phrases,
      likes: counts.likes,
      chats: counts.ends.filter((end) => end < back).length,
      of: counts.ends.length,
    });
  };
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say("away.item") }),
    h(
      Box,
      { flexDirection: "column" },
      ...AWAY_ORDER.map((s, i) =>
        h(Text, { key: s, bold: i === chosen }, `${i === chosen ? "›" : " "} ${say(`away.${s}`)}`)
      ),
    ),
    h(Text, span ? { color: "yellow" } : { dimColor: true }, price()),
    h(Text, { dimColor: true }, say("away.warning")),
    h(Menu, {
      actions: [{ key: "go", label: say("away.go"), disabled: span === null || going }, { key: "back", label: say("common.back") }],
      onPick: (key) => {
        if (key === "back") return onBack();
        if (!span || going) return;
        setGoing(true);
        client.stepAway(span).then(onGone).catch((e: Error) => {
          setGoing(false);
          onError(e.message);
        });
      },
      hint: say("common.rowActions"),
    }),
  );
}

// While away (screen 20): nothing of the product, one line, the hour it ends
// and what is left, and a way back that asks once more.
export function Away(
  { say, client, until, onBack, onError }: {
    say: Say;
    client: Client;
    until: number;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (now >= until) onBack();
  }, [now]);
  const at = new Date(until * 1000).toTimeString().slice(0, 5);
  const left = Math.max(1, Math.ceil((until - now) / 60));
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Text, null, say("away.line")),
    h(Text, { dimColor: true }, say("away.until", { time: at, minutes: left })),
    asking ? h(Text, { color: "yellow" }, say("away.sure")) : null,
    h(Menu, {
      actions: [{ key: "back", label: say("away.back") }],
      onPick: () => {
        if (!asking) return setAsking(true);
        client.comeBack().then(onBack).catch((e: Error) => onError(e.message));
      },
      hint: say("common.rowActions"),
    }),
  );
}

// Editing the name or the age from "me" (§4.11; storefront screen 10). The
// node decides and says why not; the words for its refusals were approved by
// the owner on 23.09.2026 (refusal-wordings §5). Crossing 20/21 upwards is
// asked before saving, since it cannot be undone (§8.2).
const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemes = (text: string, max: number) => [...segmenter.segment(text)].slice(0, max).map((s) => s.segment).join("");

export function EditProfile(
  { say, client, field, current, onDone, onBack, onError }: {
    say: Say;
    client: Client;
    field: "name" | "age";
    current: string;
    onDone: () => void;
    onBack: () => void;
    onError: (message: string) => void;
  },
): ReactElement {
  // What the node sent is drawn through plain() like everywhere else: a name
  // pending in the queue is the node's text too (security lens, 23.09.2026).
  const [value, setValue] = useState(plain(current, 64));
  const [asking, setAsking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const hhmm = (seconds: unknown) =>
    typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toTimeString().slice(0, 5) : "?";
  const send = () => {
    setRefused(null);
    const patch = field === "name" ? { name: value.trim() } : { age: Number(value) };
    client.editProfile(patch)
      .then((answer) => {
        if (answer.status === 200 || answer.status === 202) return onDone();
        const error = (answer.body as { error?: { code?: string; until?: number } })?.error;
        if (error?.code === "name_frozen") return setRefused(say("profile.nameFrozen"));
        if (error?.code === "age_step_down") return setRefused(say("profile.ageDown"));
        if (error?.code === "paused") return setRefused(say("write.paused", { time: hhmm(error.until) }));
        // The window slides (24 hours from each edit), so the wait is the hours
        // Retry-After names, rounded up — not "tomorrow" (owner, 2026-09-24).
        if (error?.code === "rate_limited") {
          const hours = Math.min(24, Math.max(1, Math.ceil((answer.retryAfter ?? 24 * 3600) / 3600)));
          return setRefused(say("profile.patchDay", { n: String(hours) }));
        }
        onError(`the profile edit was refused: ${answer.status}`);
      })
      .catch((e: Error) => onError(e.message));
  };
  const crossesUp = () => field === "age" && Number(current) <= 20 && Number(value) >= 21;
  return h(
    Box,
    { flexDirection: "column", gap: 1 },
    h(Head, { title: say(field === "name" ? "me.name" : "me.age"), lines: [say(field === "name" ? "me.nameHint" : "me.ageHint")] }),
    refused ? h(Text, { color: "red" }, refused) : null,
    asking ? h(Text, { color: "yellow" }, say("me.band21")) : null,
    asking
      ? h(Menu, {
        actions: [{ key: "save", label: say("me.save") }, { key: "cancel", label: say("me.cancel") }],
        onPick: (key) => {
          setAsking(false);
          if (key === "save") send();
        },
      })
      : h(Form, {
        fields: [{ key: field, label: say(field === "name" ? "me.name" : "me.age"), value }],
        // The name is cut at the node's own 24 graphemes (limits.tsv name.length),
        // so a name too long never leaves to come back as a bare error.
        onChange: (_key, next) =>
          setValue(field === "age" ? next.replace(/[^0-9]/g, "").slice(0, 3) : graphemes(next, 24)),
        actions: [
          { key: "save", label: say("me.save"), disabled: value.trim() === "" || value.trim() === current },
          { key: "back", label: say("common.back") },
        ],
        onPick: (key) => {
          if (key === "back") return onBack();
          if (crossesUp()) return setAsking(true);
          send();
        },
        actionsHint: say("common.rowActions"),
      }),
  );
}
